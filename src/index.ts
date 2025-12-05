#!/usr/bin/env node

/**
 * @fileoverview CLI entry point for the AI Code Reviewer.
 *
 * This is the orchestrator that ties together all the AI components:
 * - Prompt building (prompts.ts)
 * - LLM communication (ollama.ts)
 * - Context management (truncate.ts)
 * - Git integration (git.ts)
 *
 * ## AI Application Architecture
 *
 * This tool follows a common pattern for AI applications:
 *
 * ```
 * [User Input] → [Context Gathering] → [Prompt Building] → [LLM] → [Output Parsing] → [User Output]
 * ```
 *
 * Each stage has AI-specific considerations:
 *
 * 1. **Context Gathering** (git.ts)
 *    - Collect all relevant information for the AI
 *    - More context = better responses (usually)
 *    - But too much context = exceeds limits or confuses the model
 *
 * 2. **Prompt Building** (prompts.ts)
 *    - Craft the prompt that shapes AI behavior
 *    - Include persona, instructions, format specs
 *    - Balance context with clarity
 *
 * 3. **Context Management** (truncate.ts)
 *    - Fit content within LLM context limits
 *    - Prioritize important content
 *    - Handle overflow gracefully
 *
 * 4. **LLM Communication** (ollama.ts)
 *    - Send prompt, receive response
 *    - Handle streaming for better UX
 *    - Manage errors and retries
 *
 * 5. **Output Parsing**
 *    - Extract structured data from LLM output (verdict)
 *    - Handle format variations gracefully
 *    - Render for human consumption
 *
 * ## AI Concept: Fail Fast with Helpful Errors
 *
 * AI tools have many failure modes: model not available, context too large,
 * API errors, etc. We check prerequisites early and provide actionable guidance.
 */

import { program } from "commander";
import chalk from "chalk";
import ora from "ora";
import { type MarkedExtension, marked } from "marked";
import { markedTerminal } from "marked-terminal";

import { BUILT_IN_PROVIDERS, DEFAULT_LLM_PROVIDER, REVIEWER_NAME, TOOL_DESCRIPTION, TOOL_SHORT_NAME } from "./core/config";
import { buildBatchReviewPrompt, buildConsolidationPrompt, buildReviewPrompt } from "./core/prompts";
import { getDiff, getMainBranch, getReviewContext, hasChanges } from "./utils/git";
import { smartTruncate, splitIntoBatches } from "./utils/truncate";
import type { LLMProvider } from "./providers/types";
import { providerRegistry } from "./providers/registry";
import { OllamaProvider } from "./providers/ollama";
import { ClaudeProvider } from "./providers/claude";
import { OpenAIProvider } from "./providers/openai";
import { GeminiProvider } from "./providers/gemini";

/**
 * Configure marked to render markdown for the terminal.
 *
 * ## AI Concept: Output Formatting
 *
 * LLMs output raw text (often markdown). For good UX, we need to render
 * it appropriately for the output medium (terminal, web, etc.).
 *
 * marked-terminal converts markdown to ANSI escape codes:
 * - Headers become bold/colored
 * - Code blocks get highlighted
 * - Lists get proper indentation
 *
 * The `showSectionPrefix: false` removes the "##" from rendered headers.
 */
marked.use(
	markedTerminal({
		showSectionPrefix: false,
	}) as MarkedExtension,
);

/**
 * Renders markdown text for terminal display.
 *
 * @param markdown - Raw markdown string from the LLM
 * @returns Formatted string with ANSI codes for terminal colors/styles
 */
function renderMarkdown(markdown: string): string {
	return marked.parse(markdown) as string;
}

/**
 * CLI options that affect output behavior.
 */
interface OutputOptions {
	quiet?: boolean;
	json?: boolean;
}

/**
 * Output helpers that respect --quiet and --json modes.
 */
interface OutputHelpers {
	isQuiet: boolean;
	isJson: boolean;
	info: (message: string) => void;
	warn: (message: string) => void;
	error: (message: string) => void;
	spinner: (text: string) => ReturnType<typeof ora>;
}

/**
 * Creates output helpers that respect --quiet and --json modes.
 *
 * @param options - Output options
 * @returns Output helpers
 */
function createOutputHelpers(options: OutputOptions): OutputHelpers {
	const isQuiet = options.quiet ?? options.json ?? false;
	const isJson = options.json ?? false;

	return {
		info: (message: string): void => {
			if (!isQuiet) console.log(message);
		},
		warn: (message: string): void => {
			if (!isQuiet) console.log(message);
		},
		error: (message: string): void => {
			if (!isJson) console.error(message);
		},
		spinner: (text: string): ReturnType<typeof ora> => {
			const spinner = ora(text);

			if (isQuiet) {
				return {
					...spinner,
					start: () => spinner,
					stop: () => spinner,
					succeed: () => spinner,
					fail: () => spinner,
				} as ReturnType<typeof ora>;
			}

			return spinner;
		},
		isQuiet,
		isJson,
	};
}

/**
 * Main entry point for the CLI.
 *
 * ## AI Application Flow
 *
 * This function orchestrates the complete AI workflow:
 *
 * 1. **Parse Arguments** - What does the user want to review?
 * 2. **Check Prerequisites** - Is the AI backend ready?
 * 3. **Gather Context** - What code needs reviewing?
 * 4. **Manage Context Size** - Does it fit in the LLM's context window?
 * 5. **Build Prompt** - Craft the prompt with persona, standards, diff
 * 6. **Call LLM** - Stream the response for good UX
 * 7. **Parse Output** - Extract verdict for CI integration
 * 8. **Display Results** - Render markdown for human readability
 *
 * Each step has error handling with helpful messages.
 */
async function main(): Promise<void> {
	// ═══════════════════════════════════════════════════════════════════════════
	// STEP 1: Parse Command Line Arguments
	// ═══════════════════════════════════════════════════════════════════════════

	// ═══════════════════════════════════════════════════════════════════════════
	// Provider Registration
	// ═══════════════════════════════════════════════════════════════════════════
	//
	// ## AI Concept: Lazy Provider Registration
	//
	// Providers are registered at startup but instantiated lazily.
	// This means we only load the SDK for the provider actually used.

	providerRegistry.registerClass("ollama", OllamaProvider);
	providerRegistry.registerClass("claude", ClaudeProvider);
	providerRegistry.registerClass("openai", OpenAIProvider);
	providerRegistry.registerClass("gemini", GeminiProvider);

	program
		.name(TOOL_SHORT_NAME)
		.description(TOOL_DESCRIPTION)
		.version("1.0.0")
		.option("-s, --staged", "Review only staged changes")
		.option("-b, --branch [target]", "Review changes compared to target branch (defaults to main)")
		.option("-p, --provider <provider>", `LLM provider to use (${BUILT_IN_PROVIDERS.join(", ")})`, DEFAULT_LLM_PROVIDER)
		.option("-m, --model <model>", "Model to use (defaults to provider's default)")
		.option("-a, --all", "Review all files (runs multiple passes if needed)")
		.option("-u, --untracked", "Include untracked (new) files in the review")
		.option("--list-models", "List available models for the selected provider")
		.option("--list-providers", "List available LLM providers")
		.option("--export-prompt", "Export the prompt to stdout (for use with Claude, ChatGPT, etc.)")
		.option("--ci", "CI mode: exit with code 1 if reviewer would request changes or block")
		.option("--dry-run", "Show what would be reviewed without calling the LLM")
		.option("--json", "Output results in JSON format (for CI/CD integration)")
		.option("-q, --quiet", "Suppress spinner and info, only show review result")
		.parse();

	const options = program.opts<{
		staged?: boolean;
		branch?: string | boolean;
		provider: string;
		model?: string;
		all?: boolean;
		untracked?: boolean;
		listModels?: boolean;
		listProviders?: boolean;
		exportPrompt?: boolean;
		ci?: boolean;
		dryRun?: boolean;
		json?: boolean;
		quiet?: boolean;
	}>();

	const output = createOutputHelpers(options);

	// ═══════════════════════════════════════════════════════════════════════════
	// STEP 2: Handle --list-providers Flag
	// ═══════════════════════════════════════════════════════════════════════════

	if (options.listProviders) {
		const providers = providerRegistry.list();

		if (output.isJson) {
			console.log(JSON.stringify({ providers, default: DEFAULT_LLM_PROVIDER }, null, 2));
		} else {
			console.log(chalk.cyan("\nAvailable LLM providers:"));
			providers.forEach((p) => {
				const isDefault = p === DEFAULT_LLM_PROVIDER;

				console.log(chalk.gray(`  - ${p}${isDefault ? " (default)" : ""}`));
			});
			console.log(chalk.gray("\nUse --provider <name> to select a provider"));
		}

		process.exit(0);
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// STEP 3: Handle --export-prompt Flag (No AI needed)
	// ═══════════════════════════════════════════════════════════════════════════
	//
	// ## AI Concept: Prompt Export for Model Comparison
	//
	// Exporting the prompt lets users:
	// - Test with different models (Claude, GPT-4) for comparison
	// - Debug prompt issues by seeing exactly what's sent
	// - Use the tool without Ollama (copy/paste to web UIs)

	if (options.exportPrompt) {
		handleExportPrompt(options);

		return;
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// STEP 4: Get the Selected Provider
	// ═══════════════════════════════════════════════════════════════════════════
	//
	// ## AI Concept: Provider Resolution
	//
	// The provider is resolved from the registry based on CLI flag or env var.
	// This decouples the CLI from specific provider implementations.

	const provider = providerRegistry.get(options.provider);

	if (!provider) {
		output.error(chalk.red(`\nUnknown provider: "${options.provider}"`));
		output.info(chalk.yellow(`Available providers: ${providerRegistry.list().join(", ")}`));
		process.exit(1);
	}

	// Resolve the model (use provider default if not specified)
	const model = options.model ?? provider.getDefaultModel();

	// ═══════════════════════════════════════════════════════════════════════════
	// STEP 5: Check Provider is Available
	// ═══════════════════════════════════════════════════════════════════════════
	//
	// ## AI Concept: Backend Health Checks
	//
	// Before doing any work, verify the AI backend is available.
	// This provides clear errors instead of cryptic failures later.

	if (!options.dryRun) {
		const spinner = output.spinner(`Checking ${provider.displayName} connection...`).start();
		const healthy = await provider.checkHealth();

		if (!healthy) {
			spinner.fail(chalk.red(`${provider.displayName} is not available`));

			if (provider.name === "ollama") {
				output.info(chalk.yellow("\nMake sure Ollama is installed and running:"));
				output.info(chalk.gray("  brew install ollama"));
				output.info(chalk.gray("  ollama serve"));
				output.info(chalk.gray(`  ollama pull ${model}`));
			} else {
				output.info(chalk.yellow(`\nMake sure your ${provider.displayName} API key is set correctly.`));
			}

			process.exit(1);
		}

		spinner.succeed(`${provider.displayName} is ready`);
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// STEP 6: Handle --list-models Flag
	// ═══════════════════════════════════════════════════════════════════════════

	if (options.listModels) {
		const models = await provider.getAvailableModels();

		if (output.isJson) {
			console.log(JSON.stringify({ provider: provider.name, models }, null, 2));
		} else {
			console.log(chalk.cyan(`\nAvailable models for ${provider.displayName}:`));
			models.forEach((m: string) => {
				console.log(chalk.gray(`  - ${m}`));
			});
		}

		process.exit(0);
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// STEP 7: Verify Model is Available
	// ═══════════════════════════════════════════════════════════════════════════
	//
	// ## AI Concept: Model Availability
	//
	// Different models have different capabilities. Verifying availability
	// early prevents confusing errors during generation.

	if (!options.dryRun && options.model) {
		const modelAvailable = await provider.isModelAvailable(model);

		if (!modelAvailable) {
			output.info(chalk.red(`\nModel "${model}" is not available for ${provider.displayName}.`));

			if (provider.name === "ollama") {
				output.info(chalk.yellow(`Run: ollama pull ${model}`));
			}

			const models = await provider.getAvailableModels();

			if (models.length > 0) {
				output.info(chalk.cyan("\nAvailable models:"));
				models.forEach((m: string) => {
					output.info(chalk.gray(`  - ${m}`));
				});
			}

			process.exit(1);
		}
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// STEP 8: Check for Changes to Review
	// ═══════════════════════════════════════════════════════════════════════════
	//
	// ## AI Concept: Empty Input Handling
	//
	// Sending empty prompts wastes resources and confuses users.
	// Check early and provide context-specific guidance.

	const reviewOptions = {
		staged: options.staged,
		branch: options.branch,
		includeUntracked: options.untracked,
	};

	if (!hasChanges(reviewOptions)) {
		if (output.isJson) {
			console.log(JSON.stringify({ error: "No changes to review", verdict: null }, null, 2));
		} else {
			output.info(chalk.yellow("\nNo changes to review."));

			if (options.staged) {
				output.info(chalk.gray("Stage some changes first: git add <files>"));
			} else if (options.branch) {
				const target = typeof options.branch === "string" ? options.branch : getMainBranch();

				output.info(chalk.gray(`No commits ahead of ${target}`));
			} else {
				output.info(chalk.gray("Make some changes first!"));
				output.info(chalk.gray("Tip: Use --untracked (-u) to include new files"));
			}
		}

		process.exit(0);
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// STEP 9: Gather Diff and Context
	// ═══════════════════════════════════════════════════════════════════════════

	const context = getReviewContext(reviewOptions);
	const diff = getDiff(reviewOptions);

	// ═══════════════════════════════════════════════════════════════════════════
	// STEP 10: Handle Large Diffs
	// ═══════════════════════════════════════════════════════════════════════════
	//
	// ## AI Concept: Context Window Management
	//
	// LLMs have limited context. 15000 chars ≈ 4000 tokens, leaving room
	// for prompt (~800 tokens) and response (~1000 tokens) in a 6K context.
	//
	// Two strategies:
	// - Default: Smart truncation (skip low-priority files)
	// - --all: Batch processing (review everything in multiple passes)

	const MAX_DIFF_LENGTH = 15000;

	// ═══════════════════════════════════════════════════════════════════════════
	// STEP 11: Display Review Context
	// ═══════════════════════════════════════════════════════════════════════════

	output.info(chalk.cyan(`\n📋 Reviewing: ${context.mode}`));
	output.info(chalk.gray(`   Branch: ${context.branch}`));
	output.info(chalk.gray(`   Files: ${context.fileCount}`));
	output.info(chalk.gray(`   Provider: ${provider.displayName} (${model})`));

	if (context.commits) {
		output.info(
			chalk.gray(
				`   Commits:\n${context.commits
					.split("\n")
					.map((commit) => `      ${commit}`)
					.join("\n")}`,
			),
		);
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// STEP 12: Handle --dry-run Mode
	// ═══════════════════════════════════════════════════════════════════════════
	//
	// ## AI Concept: Dry Run for Debugging
	//
	// See what would be sent to the LLM without actually calling it.
	// Useful for debugging context issues or understanding truncation.

	if (options.dryRun) {
		const truncateResult = smartTruncate(diff, MAX_DIFF_LENGTH);
		const dryRunResult = {
			mode: context.mode,
			branch: context.branch,
			fileCount: context.fileCount,
			commits: context.commits?.split("\n") ?? [],
			provider: provider.name,
			model,
			diffLength: diff.length,
			truncated: truncateResult.wasTruncated,
			includedFiles: truncateResult.included,
			skippedFiles: truncateResult.skipped,
			wouldUseBatches: options.all && splitIntoBatches(diff, MAX_DIFF_LENGTH).length > 1,
			batchCount: options.all ? splitIntoBatches(diff, MAX_DIFF_LENGTH).length : 1,
		};

		if (output.isJson) {
			console.log(JSON.stringify(dryRunResult, null, 2));
		} else {
			console.log(chalk.cyan("\n🔍 Dry run - would review:"));
			console.log(chalk.gray(`   Diff size: ${diff.length} characters`));
			console.log(chalk.gray(`   Provider: ${provider.displayName}`));
			console.log(chalk.gray(`   Model: ${model}`));

			if (truncateResult.wasTruncated) {
				console.log(chalk.yellow(`   Would truncate: ${truncateResult.skipped.length} files skipped`));
				console.log(chalk.gray(`   Included: ${truncateResult.included.join(", ")}`));
				console.log(chalk.gray(`   Skipped: ${truncateResult.skipped.join(", ")}`));
			}

			if (options.all) {
				const batches = splitIntoBatches(diff, MAX_DIFF_LENGTH);

				console.log(chalk.gray(`   Batch mode: ${batches.length} batch(es)`));
			}

			console.log(chalk.green("\n✅ Dry run complete. No LLM calls made."));
		}

		process.exit(0);
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// STEP 13: Generate and Stream the Review
	// ═══════════════════════════════════════════════════════════════════════════
	//
	// ## AI Concept: Single vs Multi-Pass Review
	//
	// - Default mode: Single LLM call with smart truncation
	// - --all mode: Multiple LLM calls, each batch aware of previous issues

	let verdict: ReviewVerdict;

	if (options.all) {
		verdict = await reviewAllInBatches(diff, context, provider, model, MAX_DIFF_LENGTH, output);
	} else {
		verdict = await reviewWithTruncation(diff, context, provider, model, MAX_DIFF_LENGTH, output);
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// STEP 14: Handle CI Mode Exit Codes
	// ═══════════════════════════════════════════════════════════════════════════
	//
	// ## AI Concept: AI in CI/CD
	//
	// Integrating AI into automated pipelines requires:
	// - Deterministic exit codes based on AI output
	// - JSON output for parsing by other tools
	// - Verdict extraction from natural language response

	if (options.ci) {
		if (verdict === "block" || verdict === "request-changes") {
			if (!output.isJson) {
				console.log(chalk.yellow(`\n🚫 CI mode: Exiting with code 1 (verdict: ${verdict})`));
			}

			process.exit(1);
		}

		if (!output.isJson) {
			console.log(chalk.green(`\n✅ CI mode: Exiting with code 0 (verdict: ${verdict})`));
		}

		process.exit(0);
	}
}

/**
 * Handles the --export-prompt flag.
 *
 * @param options - Export prompt options
 */
function handleExportPrompt(options: { staged?: boolean; branch?: string | boolean; untracked?: boolean }): void {
	const reviewOptions = {
		staged: options.staged,
		branch: options.branch,
		includeUntracked: options.untracked,
	};

	if (!hasChanges(reviewOptions)) {
		console.error(chalk.yellow("No changes to export prompt for."));
		process.exit(0);
	}

	const context = getReviewContext(reviewOptions);
	const diff = getDiff(reviewOptions);
	const prompt = buildReviewPrompt(diff, context);

	console.log(prompt);
	console.error(chalk.gray("\n---"));
	console.error(chalk.gray("Prompt exported above. Copy and paste into Claude, ChatGPT, or any LLM."));
	console.error(chalk.gray("Tip: Pipe to clipboard with: npm run review -- --export-prompt | pbcopy"));
}

/**
 * Reviews a diff with smart truncation (default mode).
 *
 * ## AI Concept: Single-Pass Review
 *
 * Most efficient approach: one LLM call, smart truncation to fit context.
 * Tradeoff: may skip some files if diff is large.
 *
 * @param diff - The diff to review
 * @param context - Review context
 * @param provider - LLM provider to use
 * @param model - Model to use
 * @param maxLength - Maximum diff length
 * @param output - Output helpers
 * @returns The review verdict
 */
async function reviewWithTruncation(
	diff: string,
	context: ReturnType<typeof getReviewContext>,
	provider: LLMProvider,
	model: string,
	maxLength: number,
	output: OutputHelpers,
): Promise<ReviewVerdict> {
	const truncateResult = smartTruncate(diff, maxLength);

	if (truncateResult.wasTruncated) {
		output.info(
			chalk.yellow(
				`\n⚠️  Diff truncated: reviewing ${truncateResult.included.length} of ${truncateResult.included.length + truncateResult.skipped.length} files`,
			),
		);
		output.info(chalk.gray(`   Use --all to review everything in multiple passes`));

		if (truncateResult.skipped.length > 0) {
			output.info(chalk.gray(`   Skipped: ${truncateResult.skipped.slice(0, 5).join(", ")}${truncateResult.skipped.length > 5 ? "..." : ""}`));
		}
	}

	output.info("");

	const prompt = buildReviewPrompt(truncateResult.diff, context);

	return await runReview(prompt, provider, model, output);
}

/**
 * Reviews ALL files by splitting into batches (--all mode).
 *
 * ## AI Concept: Multi-Pass Review with Context Carryover
 *
 * When content exceeds limits, we process in batches. Key innovation:
 * each batch is aware of issues found in previous batches, enabling:
 *
 * - Cross-file consistency checking
 * - No duplicate issue reporting
 * - Cumulative understanding of the change
 *
 * Final consolidation pass synthesizes all findings.
 *
 * @param diff - The diff to review
 * @param context - Review context
 * @param provider - LLM provider to use
 * @param model - Model to use
 * @param maxLength - Maximum diff length per batch
 * @param output - Output helpers
 * @returns The review verdict
 */
async function reviewAllInBatches(
	diff: string,
	context: ReturnType<typeof getReviewContext>,
	provider: LLMProvider,
	model: string,
	maxLength: number,
	output: OutputHelpers,
): Promise<ReviewVerdict> {
	const batches = splitIntoBatches(diff, maxLength);

	if (batches.length === 1) {
		output.info("");
		const prompt = buildReviewPrompt(batches[0].diff, context);

		return await runReview(prompt, provider, model, output);
	}

	output.info(chalk.yellow(`\n📦 Large diff: reviewing ${batches.length} batches iteratively`));
	output.info(chalk.gray(`   Each batch builds on previous findings for cross-file consistency\n`));

	const allIssues: string[] = [];
	let totalFiles = 0;

	for (const batch of batches) {
		output.info(chalk.cyan(`━━━ Batch ${batch.batchNumber}/${batch.totalBatches} ━━━`));
		output.info(chalk.gray(`    Files: ${batch.files.join(", ")}`));
		output.info("");

		totalFiles += batch.files.length;

		// Build prompt with context from previous batches (context carryover)
		const prompt = buildBatchReviewPrompt(
			batch.diff,
			context,
			{ current: batch.batchNumber, total: batch.totalBatches, files: batch.files },
			allIssues,
		);

		const response = await runReviewAndCollect(prompt, provider, model, `Reviewing batch ${batch.batchNumber}/${batch.totalBatches}...`, output);

		const batchIssues = extractIssuesFromResponse(response);

		if (batchIssues.length > 0) {
			allIssues.push(...batchIssues);
			output.info(chalk.gray(`    Found ${batchIssues.length} issue(s) in this batch`));
		} else {
			output.info(chalk.gray(`    No issues found in this batch`));
		}

		output.info("");
	}

	// Final consolidation - synthesize all findings into one verdict
	output.info(chalk.cyan(`━━━ Final Consolidation ━━━`));
	output.info(chalk.gray(`    Consolidating ${allIssues.length} issues from ${totalFiles} files\n`));

	const consolidationPrompt = buildConsolidationPrompt(allIssues, context, totalFiles);

	const verdict = await runReview(consolidationPrompt, provider, model, output, "Generating final verdict...");

	output.info("");
	output.info(chalk.green(`✅ Review complete: ${batches.length} batches, ${totalFiles} files`));

	return verdict;
}

/**
 * Extracts issue lines from an LLM response.
 *
 * ## AI Concept: Output Parsing
 *
 * LLMs output natural language. To use their output programmatically,
 * we need to extract structured data. Strategies:
 *
 * - **Regex matching**: Look for patterns (what we do here)
 * - **JSON mode**: Some LLMs can output valid JSON
 * - **Function calling**: Modern APIs can return structured data
 *
 * Our approach: look for lines that match issue format, filter noise.
 *
 * @param response - The LLM response
 * @returns Array of issue strings
 */
function extractIssuesFromResponse(response: string): string[] {
	const lines = response.split("\n");
	const issues: string[] = [];

	for (const line of lines) {
		const trimmed = line.trim();

		if (
			trimmed.startsWith("- ") &&
			trimmed.length > 10 &&
			!trimmed.toLowerCase().includes("none found") &&
			!trimmed.toLowerCase().includes("no issues")
		) {
			issues.push(trimmed.substring(2));
		}
	}

	return issues;
}

/**
 * Runs a review and returns the raw response (for batch accumulation).
 *
 * @param prompt - The prompt
 * @param provider - LLM provider to use
 * @param model - Model to use
 * @param spinnerText - Spinner text
 * @param output - Output helpers
 * @returns The raw LLM response
 */
async function runReviewAndCollect(
	prompt: string,
	provider: LLMProvider,
	model: string,
	spinnerText: string,
	output: OutputHelpers,
): Promise<string> {
	const reviewSpinner = output.spinner(spinnerText).start();
	let chunkCount = 0;

	try {
		const response = await provider.streamResponse(
			prompt,
			() => {
				chunkCount++;

				if (chunkCount % 10 === 0) {
					const dots = ".".repeat((chunkCount / 10) % 4);

					reviewSpinner.text = `${spinnerText.replace("...", "")}${dots}`;
				}
			},
			{ model },
		);

		reviewSpinner.succeed(spinnerText.replace("...", ""));

		return response;
	} catch (error) {
		reviewSpinner.fail("Review failed");
		output.error(chalk.red("\nError during review:"));
		console.error(error);
		process.exit(1);
	}
}

/**
 * Verdict types for CI mode exit codes.
 */
type ReviewVerdict = "approve" | "request-changes" | "block" | "unknown";

/**
 * Extracts the verdict from a review response.
 *
 * ## AI Concept: Classification from Natural Language
 *
 * The LLM outputs natural language with a verdict embedded.
 * We need to classify it into discrete categories.
 *
 * Strategies:
 * - Look for emojis (✅, ❌, 🔄) - visual and unambiguous
 * - Look for keywords ("would approve", "would block")
 * - Default to "unknown" if unclear
 *
 * This is a simple form of "intent classification" from NLP.
 *
 * @param response - The LLM response
 * @returns The classified verdict
 */
function extractVerdict(response: string): ReviewVerdict {
	const lowerResponse = response.toLowerCase();

	if (lowerResponse.includes("✅") || lowerResponse.includes("would approve")) {
		return "approve";
	}

	if (lowerResponse.includes("❌") || lowerResponse.includes("would block")) {
		return "block";
	}

	if (lowerResponse.includes("🔄") || lowerResponse.includes("request changes")) {
		return "request-changes";
	}

	return "unknown";
}

/**
 * Runs a single review with streaming output.
 *
 * ## AI Concept: Streaming for UX
 *
 * Instead of waiting for complete response, we stream tokens as they
 * generate. This provides immediate feedback and feels more responsive.
 *
 * The spinner animates while waiting, then we render the complete
 * markdown response once streaming is done.
 *
 * @param prompt - The prompt
 * @param provider - LLM provider to use
 * @param model - Model to use
 * @param output - Output helpers
 * @param spinnerText - Spinner text
 * @returns The review verdict
 */
async function runReview(
	prompt: string,
	provider: LLMProvider,
	model: string,
	output: OutputHelpers,
	spinnerText = `${REVIEWER_NAME} is reviewing your code...`,
): Promise<ReviewVerdict> {
	const reviewSpinner = output.spinner(spinnerText).start();
	let chunkCount = 0;

	try {
		const response = await provider.streamResponse(
			prompt,
			() => {
				chunkCount++;

				if (chunkCount % 10 === 0) {
					const dots = ".".repeat((chunkCount / 10) % 4);

					reviewSpinner.text = `${spinnerText.replace("...", "")}${dots}`;
				}
			},
			{ model },
		);

		reviewSpinner.stop();

		if (output.isJson) {
			const verdict = extractVerdict(response);

			console.log(
				JSON.stringify(
					{
						verdict,
						review: response,
						provider: provider.name,
						model,
					},
					null,
					2,
				),
			);

			return verdict;
		}

		console.log();
		console.log(chalk.gray("─".repeat(60)));
		console.log();
		console.log(renderMarkdown(response));
		console.log(chalk.gray("─".repeat(60)));
		console.log(chalk.gray(`Provider: ${provider.displayName} | Model: ${model}`));

		return extractVerdict(response);
	} catch (error) {
		reviewSpinner.fail("Review failed");
		output.error(chalk.red("\nError during review:"));
		console.error(error);
		process.exit(1);
	}
}

// ═══════════════════════════════════════════════════════════════════════════════
// Execute Main Function
// ═══════════════════════════════════════════════════════════════════════════════

main().catch((error: unknown) => {
	console.error(chalk.red("Fatal error:"), error);
	process.exit(1);
});
