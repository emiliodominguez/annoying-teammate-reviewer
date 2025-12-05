/**
 * @fileoverview Prompt templates for the AI code reviewer.
 *
 * This module contains the "soul" of the tool - the prompts that shape LLM behavior.
 * Understanding these prompts is key to understanding how AI assistants work.
 *
 * ## Why Prompts Matter
 *
 * LLMs are essentially "prompt completion machines" - they predict what text should
 * come next based on the prompt you give them. The prompt IS the programming language
 * for AI. A well-crafted prompt can turn a general-purpose LLM into a specialized tool.
 *
 * ## Key Prompt Engineering Concepts Used Here
 *
 * ### 1. Role Assignment (System Prompting)
 * We tell the LLM "You are a code reviewer" - this activates patterns the model
 * learned during training about how code reviewers behave. Role assignment creates
 * consistency and helps the model stay "in character."
 *
 * ### 2. Few-Shot vs Zero-Shot
 * - **Zero-shot**: Just instructions, no examples (what we use here)
 * - **Few-shot**: Include examples of good responses
 * We use zero-shot because code reviews are variable, but you could add examples
 * of good reviews to improve consistency.
 *
 * ### 3. Output Format Specification
 * LLMs will match whatever format you specify. By defining exact sections
 * (Verdict, Issues Found, Summary), we get predictable, parseable output.
 * Without format specs, every response would be structured differently.
 *
 * ### 4. Grounding / Context Injection
 * LLMs only know their training data. We "ground" them by injecting:
 * - Project standards (what rules to apply)
 * - The actual diff (what to review)
 * - Branch/commit context (intent signals)
 *
 * ### 5. Anti-Hallucination Techniques
 * LLMs confidently generate plausible-sounding but false information.
 * We combat this with:
 * - Explicit "ONLY discuss what's in the diff" rules
 * - Self-check questions ("Can I quote this from the diff?")
 * - Concrete examples of mistakes to avoid
 *
 * ### 6. Prompt Ordering (for Local Models)
 * Smaller models have limited "attention" - they focus more on recent text.
 * We put the diff FIRST so the model sees it before drowning in instructions.
 * Larger models (GPT-4, Claude) handle any ordering, but local models benefit
 * from careful prompt structure.
 *
 * ## Experimentation Tips
 *
 * - Change one thing at a time and test
 * - Different models respond differently to the same prompt
 * - "Temperature" affects creativity vs consistency
 * - Shorter prompts often work better than longer ones
 * - When in doubt, be more explicit, not less
 */

import type { ReviewContext } from "../utils/git";
import { REVIEWER_PERSONALITY_CUSTOMIZATION, REVIEW_STRICTNESS_LEVEL, STRICTNESS_DESCRIPTIONS } from "./config";

/**
 * Project-specific coding standards injected into the prompt.
 *
 * ## AI Concept: Grounding / Knowledge Injection
 *
 * LLMs only know what was in their training data. They don't know YOUR project's
 * specific conventions. By including standards in the prompt, we:
 *
 * 1. **Ground the model** - Give it specific facts to reference
 * 2. **Reduce hallucination** - It can point to real rules instead of inventing them
 * 3. **Customize behavior** - Same model, different standards = different reviewer
 *
 * ## Token Budget Considerations
 *
 * Every character in the prompt costs "tokens" (roughly 4 chars = 1 token).
 * Local models have small context windows (4K-8K tokens typically).
 *
 * Budget breakdown for an 8K context model:
 * - Standards: ~500 tokens
 * - Instructions: ~300 tokens
 * - Diff: ~4000 tokens (the main content)
 * - Response: ~2000 tokens (model's output)
 *
 * If standards are too long, you'll truncate the diff. Keep them concise!
 *
 * ## Format Choices
 *
 * We use markdown headers and bullet points because:
 * - LLMs are trained on lots of markdown (GitHub, docs, etc.)
 * - Clear visual hierarchy helps the model parse sections
 * - "(Flag if wrong)" is an action cue - tells model what to DO with the info
 */
export const PROJECT_STANDARDS = `
## Project Standards

### IMPORTS (Flag if wrong)
- Prefer path aliases over deep relative imports (e.g., "../../../")
- Order: 1) Language/framework 2) External libs 3) Internal modules 4) Relative 5) Styles
- Use "import type" for type-only imports (TypeScript)

### CODE ORGANIZATION (Flag if wrong)
- Keep functions focused - single responsibility
- Extract reusable logic into utility functions
- Co-locate related files (component + styles + tests)

### TYPESCRIPT (Flag if wrong)
- Avoid "any" - use proper types or "unknown"
- All function parameters and returns should be typed
- Use type predicates for type guards: (value): value is Type

### NAMING (Flag if wrong)
- Files/folders: kebab-case or consistent with project convention
- Components/Classes/Types: PascalCase
- Functions/variables: camelCase
- Constants: UPPER_SNAKE_CASE
- Boolean variables: use is/has/should prefixes (isLoading, hasError)

### ERROR HANDLING (Flag if wrong)
- No empty catch blocks - at minimum log the error
- Async operations must handle errors
- Use try/catch at boundaries, not around every line

### DOCUMENTATION (Flag if missing on public APIs)
- Exported functions need JSDoc with @param and @returns
- Complex logic needs comments explaining "why" not "what"

### ANTI-PATTERNS TO FLAG
- Console.log left in production code
- Commented-out code that should be deleted
- Business logic mixed into UI components
- Missing error handling for async operations
- Unused imports or variables
- Type assertions without validation (as Type)
- Magic numbers without named constants
- Deeply nested conditionals (consider early returns)
`;

/**
 * Core instructions that control LLM behavior and prevent hallucination.
 *
 * ## AI Concept: Instruction Hierarchy
 *
 * LLMs follow instructions in roughly this priority order:
 * 1. System prompt (highest priority)
 * 2. Recent context (what was just said)
 * 3. Earlier context (can be "forgotten" in long conversations)
 *
 * We put critical rules at the TOP with strong language (CRITICAL, NEVER, MUST)
 * because smaller models especially need clear, forceful instructions.
 *
 * ## AI Concept: Hallucination Prevention
 *
 * Hallucination is when LLMs generate confident-sounding but false information.
 * It's the #1 problem with using AI for code review - the model might:
 * - Invent function names that don't exist
 * - Reference line numbers not in the diff
 * - Make up plausible-sounding but fictional issues
 *
 * Our multi-layered defense:
 *
 * 1. **Explicit prohibition**: "NEVER invent or imagine code"
 * 2. **Self-verification prompt**: "Can I copy-paste this from the diff?"
 * 3. **Concrete examples**: Show specific mistakes to avoid
 * 4. **Escape hatch**: "If code looks fine, say 'None - looks good!'"
 *
 * The escape hatch is crucial - without it, the model feels pressure to
 * find SOMETHING wrong, which leads to invented issues.
 *
 * ## AI Concept: Output Format Control
 *
 * By specifying exact format (## Verdict, ## Issues Found, ## Summary),
 * we get consistent, parseable output. This enables:
 * - Automated verdict extraction for CI/CD
 * - Consistent user experience
 * - Easier debugging of model behavior
 *
 * The format acts as a "template" the model fills in.
 */
export const REVIEWER_INSTRUCTIONS = `
CRITICAL RULES - FOLLOW EXACTLY:
1. ONLY discuss code that appears in the diff below (lines starting with + or -)
2. NEVER invent or imagine code that isn't shown - this is your #1 failure mode
3. NEVER mention functions, variables, or files unless you can quote them from the diff
4. If the code looks fine, say "None - looks good!" - don't force issues
5. STOP after the Summary section
6. For README/documentation files: Only flag actual errors (broken links, incorrect info). Do NOT flag notes, disclaimers, or badges as "issues"
7. "This is not an issue but..." means it's NOT an issue - don't list it

BEFORE WRITING ANY ISSUE, ASK YOURSELF:
- Can I copy-paste the exact code I'm criticizing from the diff above?
- Is this a REAL problem I can see, or am I guessing/assuming?
- If I cannot point to a specific line in the diff, I must NOT mention it

COMMON MISTAKES TO AVOID:
- Making up function names like "createFileDiff" that aren't in the diff
- Suggesting "extract to utility" for code you can't see
- Generic advice about "repeated logic" without quoting the actual repeated code
- Inventing variables like "expectedDiff" that don't exist in the diff
- Listing documentation text (notes, disclaimers, badges) as code issues
- Writing "This is not an issue but..." - if it's not an issue, don't list it at all

RESPONSE FORMAT (use exactly this structure, then STOP):

## Verdict
[Choose ONE: ✅ Would approve | 🔄 Would request changes | ❌ Would block]

## Issues Found
[For each issue, quote the EXACT code from the diff, OR write "None - looks good!"]
Format: \`filename:line\` - "quoted code" - explanation

## Summary
[One sentence describing what this code change does, then STOP writing]
`;

/**
 * Complete reviewer persona combining role, personality, and instructions.
 *
 * ## AI Concept: Persona / Role Assignment
 *
 * "You are a code reviewer" activates the model's understanding of that role
 * from its training data. This is called "role prompting" or "persona assignment."
 *
 * Why it works:
 * - LLMs saw millions of code reviews during training
 * - Assigning the role activates relevant patterns
 * - The model "knows" how code reviewers communicate
 *
 * The personality customization (from config.ts) adds flavor:
 * - Catchphrases create memorable, consistent voice
 * - Pet peeves focus attention on specific issues
 * - Tone guidelines (direct, uses dry humor) shape communication style
 *
 * ## Conditional Injection
 *
 * The ternary `${REVIEWER_PERSONALITY_CUSTOMIZATION ? ... : ""}` allows
 * running with or without personality. Empty personality = neutral reviewer.
 * This is useful for testing prompt changes in isolation.
 */
export const REVIEWER_PERSONALITY = `
You are a code reviewer. Your job is to review the EXACT git diff shown below.

## Review Strictness: ${REVIEW_STRICTNESS_LEVEL}
${STRICTNESS_DESCRIPTIONS[REVIEW_STRICTNESS_LEVEL]}
${REVIEWER_PERSONALITY_CUSTOMIZATION.trim() ? `\n## Your Personality\n${REVIEWER_PERSONALITY_CUSTOMIZATION}` : ""}
${REVIEWER_INSTRUCTIONS}
`;

/**
 * Assembles the complete review prompt from components.
 *
 * ## AI Concept: Prompt Structure for Local Models
 *
 * The order of content matters, especially for smaller models with limited
 * "attention spans." Our structure:
 *
 * ```
 * 1. THE DIFF (what to review) - PUT FIRST for local models
 * 2. Instructions (how to review)
 * 3. Standards (reference material)
 * 4. Final reminder (reinforcement)
 * ```
 *
 * Why diff first? Local models (llama, mistral) have limited context windows
 * and tend to focus on recent content. By putting the diff early, we ensure
 * the model has "seen" all the code before we pile on instructions.
 *
 * Larger models (GPT-4, Claude) handle any order, but this structure
 * works well across model sizes.
 *
 * ## AI Concept: Code Fences as Delimiters
 *
 * The ```diff fence serves multiple purposes:
 * 1. **Visual separation**: Clear boundary between prose and code
 * 2. **Format hint**: Tells model this is diff format specifically
 * 3. **Prevents confusion**: Model won't misinterpret diff symbols as instructions
 *
 * ## AI Concept: Semantic Separators
 *
 * The `---` separator is a "soft break" that signals "reference material above,
 * task below." LLMs recognize this pattern from training on documents.
 *
 * @param diff - Git diff in unified format
 * @param context - Metadata (branch, files, mode)
 * @returns Complete prompt string
 */
export function buildReviewPrompt(diff: string, context: ReviewContext): string {
	// Conditional context - only include if data exists
	// This keeps prompts clean and avoids "Files changed (0):" noise
	const filesContext = context.files.length ? `\nFiles changed (${context.fileCount}): ${context.files.join(", ")}` : "";
	const commitsContext = context.commits ? `\nCommits:\n${context.commits}` : "";

	// Prompt assembly - structure optimized for local models
	return `# Code Review

## The Diff to Review

Branch: ${context.branch}
Mode: ${context.mode}${filesContext}${commitsContext}

\`\`\`diff
${diff}
\`\`\`

## Your Task

${REVIEWER_PERSONALITY}

## Project Standards (Reference)
${PROJECT_STANDARDS}

---

Now write your review of the diff above. Remember: ONLY comment on code shown in the diff. Use the exact format (Verdict, Issues Found, Summary).
`;
}

/**
 * Prompt for reviewing commit messages only.
 *
 * ## AI Concept: Task-Specific Prompts
 *
 * Different tasks need different prompts. This one focuses the model
 * specifically on commit message format rather than code quality.
 *
 * By narrowing the scope ("Focus only on: 1, 2, 3"), we:
 * - Reduce hallucination (less room for invented issues)
 * - Get more relevant output
 * - Save tokens (shorter response)
 *
 * @param commits - Commit messages to review
 * @param branchName - Current branch name
 * @returns Complete prompt for commit review
 */
export function buildCommitMessagePrompt(commits: string, branchName: string): string {
	return `${REVIEWER_PERSONALITY}

${PROJECT_STANDARDS}

---

Review these commit messages from branch "${branchName}" for adherence to the commit format:

${commits}

Focus only on:
1. Does each commit follow the format: <type>(<scope>): <Subject in sentence case>?
2. Are the types and scopes valid?
3. Are the messages clear and descriptive?

Be brief - just note any issues with specific commits.
`;
}

/**
 * Prompt for batch reviews (part of iterative review strategy).
 *
 * ## AI Concept: Iterative / Multi-Turn Prompting
 *
 * When content exceeds context limits, we can:
 * 1. **Truncate**: Skip some content (lossy)
 * 2. **Summarize**: Compress previous content (lossy)
 * 3. **Iterate**: Process in batches with context passing (what we do)
 *
 * Our iterative approach:
 * - Split diff into batches that fit context
 * - Each batch knows about previous issues (context injection)
 * - Final consolidation pass synthesizes everything
 *
 * The `previousIssues` parameter is "context injection" - we tell the model
 * what it found before so it can:
 * - Avoid duplicate reports
 * - Check for patterns across files
 * - Build cumulative understanding
 *
 * ## AI Concept: Simpler Format for Intermediate Steps
 *
 * Batch reviews use a simpler format (just Issues + Notes) because:
 * - No verdict needed mid-process
 * - Easier to parse and accumulate
 * - Saves tokens for the final summary
 *
 * @param diff - Diff content for this batch
 * @param context - Review context
 * @param batchInfo - Which batch this is
 * @param previousIssues - Issues found in earlier batches
 * @returns Prompt for this batch
 */
export function buildBatchReviewPrompt(
	diff: string,
	context: ReviewContext,
	batchInfo: { current: number; total: number; files: string[] },
	previousIssues: string[],
): string {
	// Inject previous issues if any exist
	// This is "context carryover" - giving the model memory across batches
	const previousContext =
		previousIssues.length > 0
			? `
## Issues Found in Previous Batches
${previousIssues.map((issue, idx) => `${idx + 1}. ${issue}`).join("\n")}

Do NOT repeat these issues. Only report NEW issues in this batch.
`
			: "";

	return `# Code Review - Batch ${batchInfo.current}/${batchInfo.total}

## Files in This Batch
${batchInfo.files.join(", ")}
${previousContext}
## The Diff

Branch: ${context.branch}

\`\`\`diff
${diff}
\`\`\`

## Your Task

Review ONLY the code in this batch. List any issues you find.

OUTPUT FORMAT (use exactly this):

### Issues
- **filename:line** - description of the issue
- **filename:line** - description of the issue
(or "None found" if no issues)

### Notes
Any observations about this code that might be relevant for other files.

RULES:
- ONLY report issues in the files shown above
- Be specific: include filename and describe the exact problem
- Do NOT suggest general improvements or best practices
- Do NOT repeat issues from previous batches
`;
}

/**
 * Prompt for consolidating batch reviews into final verdict.
 *
 * ## AI Concept: Meta-Prompting / Synthesis
 *
 * This is a "meta-task" - the model reviews its own previous outputs
 * rather than the original code. This is powerful because:
 *
 * 1. **Synthesis**: Combines findings into coherent summary
 * 2. **Prioritization**: Model can assess severity across all issues
 * 3. **Deduplication**: Can identify and merge similar issues
 * 4. **Judgment**: Makes the final approve/reject decision
 *
 * ## AI Concept: Severity Classification
 *
 * We ask the model to categorize by severity (Critical, Should Fix, Nits).
 * This works because LLMs have good intuition about issue importance
 * from seeing millions of code reviews during training.
 *
 * The categories guide both the model's thinking and the user's attention.
 *
 * @param allIssues - Combined issues from all batches
 * @param context - Original review context
 * @param fileCount - Total files reviewed
 * @returns Consolidation prompt
 */
export function buildConsolidationPrompt(allIssues: string[], context: ReviewContext, fileCount: number): string {
	const issuesList = allIssues.length > 0 ? allIssues.map((issue, idx) => `${idx + 1}. ${issue}`).join("\n") : "No issues found.";

	return `# Code Review - Final Summary

You reviewed ${fileCount} files across multiple batches. Now consolidate your findings.

## Branch
${context.branch}

## All Issues Found
${issuesList}

## Your Task

Give a final consolidated review. Group similar issues, prioritize by severity.

RESPOND IN THIS EXACT FORMAT:

## Verdict
[Choose ONE: ✅ Would approve | 🔄 Would request changes | ❌ Would block]

## Critical Issues (must fix)
[List blockers, or "None"]

## Should Fix
[List important issues, or "None"]

## Nits (optional)
[List minor suggestions, or "None"]

## Summary
[2-3 sentences: What does this change do? What's the overall code quality?]
`;
}
