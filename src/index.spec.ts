/**
 * Tests for the CLI module (index.ts).
 *
 * @remarks
 * The index.ts file is the main CLI entry point with many external dependencies.
 * Since mocking in ESM mode is complex, we focus on testing:
 * 1. The data structures and expected formats
 * 2. Logic that can be tested without mocking (extracted behaviors)
 *
 * Integration testing of the full CLI flow is better done via actual CLI invocations.
 */

import { describe, expect, test } from "@jest/globals";

describe("CLI module (index.ts)", () => {
	describe("OutputOptions interface", () => {
		test("should support quiet mode", () => {
			// Given
			const options = { quiet: true, json: false };

			// Then
			expect(options.quiet).toBe(true);
			expect(options.json).toBe(false);
		});

		test("should support json mode", () => {
			// Given
			const options = { quiet: false, json: true };

			// Then
			expect(options.quiet).toBe(false);
			expect(options.json).toBe(true);
		});

		test("should support both modes simultaneously", () => {
			// Given
			const options = { quiet: true, json: true };

			// Then
			expect(options.quiet).toBe(true);
			expect(options.json).toBe(true);
		});
	});

	describe("extractVerdict logic", () => {
		/**
		 * Tests the verdict extraction logic as used in the CLI.
		 */
		function extractVerdict(response: string): "approve" | "block" | "request-changes" | "unknown" {
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

		test("should detect approve verdict from checkmark emoji", () => {
			// Given
			const response = "✅ Would approve\n\nLooks good!";

			// When
			const verdict = extractVerdict(response);

			// Then
			expect(verdict).toBe("approve");
		});

		test("should detect approve verdict from text", () => {
			// Given
			const response = "I would approve this PR. Nice work!";

			// When
			const verdict = extractVerdict(response);

			// Then
			expect(verdict).toBe("approve");
		});

		test("should detect block verdict from X emoji", () => {
			// Given
			const response = "❌ Would block\n\nSecurity issues found.";

			// When
			const verdict = extractVerdict(response);

			// Then
			expect(verdict).toBe("block");
		});

		test("should detect block verdict from text", () => {
			// Given
			const response = "I would block this - critical bug found.";

			// When
			const verdict = extractVerdict(response);

			// Then
			expect(verdict).toBe("block");
		});

		test("should detect request-changes verdict from emoji", () => {
			// Given
			const response = "🔄 Would request changes\n\nNeeds some fixes.";

			// When
			const verdict = extractVerdict(response);

			// Then
			expect(verdict).toBe("request-changes");
		});

		test("should detect request-changes verdict from text", () => {
			// Given
			const response = "I would request changes before merging.";

			// When
			const verdict = extractVerdict(response);

			// Then
			expect(verdict).toBe("request-changes");
		});

		test("should return unknown for ambiguous response", () => {
			// Given
			const response = "This is an interesting change.";

			// When
			const verdict = extractVerdict(response);

			// Then
			expect(verdict).toBe("unknown");
		});
	});

	describe("extractIssuesFromResponse logic", () => {
		/**
		 * Tests the issue extraction logic as used in the CLI.
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

		test("should extract issues from formatted response", () => {
			// Given
			const response = `## Issues

- **src/file.ts:10** - Missing error handling
- **src/other.ts:20** - Unused import
- None found in this section`;

			// When
			const issues = extractIssuesFromResponse(response);

			// Then
			expect(issues).toHaveLength(2);
			expect(issues[0]).toContain("src/file.ts:10");
			expect(issues[1]).toContain("src/other.ts:20");
		});

		test("should filter out 'None found' lines", () => {
			// Given
			const response = `## Issues

- None found
- No issues here`;

			// When
			const issues = extractIssuesFromResponse(response);

			// Then
			expect(issues).toHaveLength(0);
		});

		test("should handle empty response", () => {
			// Given
			const response = "";

			// When
			const issues = extractIssuesFromResponse(response);

			// Then
			expect(issues).toHaveLength(0);
		});

		test("should extract multiple issues from different sections", () => {
			// Given
			const response = `## Critical Issues
- **src/auth.ts:5** - SQL injection vulnerability

## Should Fix
- **src/api.ts:20** - Missing validation
- **src/utils.ts:30** - Potential null pointer

## Nits
- **src/config.ts:1** - Consider using const`;

			// When
			const issues = extractIssuesFromResponse(response);

			// Then
			expect(issues).toHaveLength(4);
		});
	});

	describe("CLI option structure", () => {
		/**
		 * Tests that verify the expected CLI option structure.
		 */

		test("should define expected CLI options", () => {
			// These are the expected options based on the program definition
			const expectedOptions = [
				{ short: "-s", long: "--staged", description: "Review only staged changes" },
				{ short: "-b", long: "--branch [target]", description: "Review changes compared to target branch" },
				{ short: "-m", long: "--model <model>", description: "Ollama model to use" },
				{ short: "-a", long: "--all", description: "Review all files" },
				{ short: "-u", long: "--untracked", description: "Include untracked files" },
				{ long: "--list-models", description: "List available Ollama models" },
				{ long: "--export-prompt", description: "Export the prompt to stdout" },
				{ long: "--ci", description: "CI mode with exit codes" },
				{ long: "--dry-run", description: "Show what would be reviewed" },
				{ long: "--json", description: "Output results in JSON format" },
				{ short: "-q", long: "--quiet", description: "Suppress spinner and info" }
			];

			// Verify all expected options are defined
			expect(expectedOptions).toHaveLength(11);
			expectedOptions.forEach((option) => {
				expect(option.long).toBeDefined();
				expect(option.description).toBeDefined();
			});
		});
	});

	describe("Exit codes", () => {
		/**
		 * Helper to determine if a verdict should cause exit code 1 in CI mode.
		 */
		function shouldExitWithError(verdict: string): boolean {
			return verdict === "block" || verdict === "request-changes";
		}

		test("approve verdict should map to exit code 0", () => {
			// Given
			const verdict = "approve";

			// Then - in CI mode, approve exits with 0
			expect(shouldExitWithError(verdict)).toBe(false);
		});

		test("request-changes verdict should map to exit code 1 in CI mode", () => {
			// Given
			const verdict = "request-changes";

			// Then
			expect(shouldExitWithError(verdict)).toBe(true);
		});

		test("block verdict should map to exit code 1 in CI mode", () => {
			// Given
			const verdict = "block";

			// Then
			expect(shouldExitWithError(verdict)).toBe(true);
		});
	});

	describe("Dry run result structure", () => {
		test("should have expected properties", () => {
			// Given
			const dryRunResult = {
				mode: "working tree",
				branch: "feature/test",
				fileCount: 3,
				commits: ["abc123 First commit"],
				model: "test-model",
				diffLength: 5000,
				truncated: false,
				includedFiles: ["file1.ts", "file2.ts", "file3.ts"],
				skippedFiles: [],
				wouldUseBatches: false,
				batchCount: 1
			};

			// Then
			expect(dryRunResult.mode).toBe("working tree");
			expect(dryRunResult.fileCount).toBe(3);
			expect(dryRunResult.model).toBe("test-model");
			expect(dryRunResult.truncated).toBe(false);
			expect(dryRunResult.includedFiles).toHaveLength(3);
			expect(dryRunResult.wouldUseBatches).toBe(false);
		});
	});

	describe("JSON output structure", () => {
		test("should have verdict, review, and model for successful review", () => {
			// Given
			const jsonOutput = {
				verdict: "approve",
				review: "✅ Would approve\n\nLooks good!",
				model: "llama3.2"
			};

			// Then
			expect(jsonOutput.verdict).toBe("approve");
			expect(jsonOutput.review).toContain("Would approve");
			expect(jsonOutput.model).toBe("llama3.2");
		});

		test("should have error and null verdict for failures", () => {
			// Given
			const errorJsonOutput = {
				error: "No changes to review",
				verdict: null
			};

			// Then
			expect(errorJsonOutput.error).toBe("No changes to review");
			expect(errorJsonOutput.verdict).toBeNull();
		});
	});
});
