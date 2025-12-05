import type { ReviewContext } from "../utils/git";
import {
	PROJECT_STANDARDS,
	REVIEWER_INSTRUCTIONS,
	REVIEWER_PERSONALITY,
	buildBatchReviewPrompt,
	buildCommitMessagePrompt,
	buildConsolidationPrompt,
	buildReviewPrompt,
} from "./prompts";

describe("Prompts module", () => {
	describe("PROJECT_STANDARDS", () => {
		test("should be a non-empty string", () => {
			// Given
			// When
			// Then
			expect(typeof PROJECT_STANDARDS).toEqual("string");
			expect(PROJECT_STANDARDS.length).toBeGreaterThan(0);
		});

		test("should contain import guidelines", () => {
			// Given
			// When
			// Then
			expect(PROJECT_STANDARDS.toLowerCase()).toContain("import");
		});

		test("should mention path aliases", () => {
			// Given
			// When
			// Then
			expect(PROJECT_STANDARDS.toLowerCase()).toContain("path aliases");
		});

		test("should contain TypeScript guidelines", () => {
			// Given
			// When
			// Then
			expect(PROJECT_STANDARDS.toLowerCase()).toContain("typescript");
		});

		test("should contain error handling guidelines", () => {
			// Given
			// When
			// Then
			expect(PROJECT_STANDARDS.toLowerCase()).toContain("error");
		});
	});

	describe("REVIEWER_INSTRUCTIONS", () => {
		test("should be a non-empty string", () => {
			// Given
			// When
			// Then
			expect(typeof REVIEWER_INSTRUCTIONS).toEqual("string");
			expect(REVIEWER_INSTRUCTIONS.length).toBeGreaterThan(0);
		});

		test("should contain anti-hallucination instructions", () => {
			// Given
			// When
			// Then
			expect(REVIEWER_INSTRUCTIONS.toLowerCase()).toContain("never invent");
		});

		test("should specify the response format", () => {
			// Given
			// When
			// Then
			expect(REVIEWER_INSTRUCTIONS).toContain("Verdict");
			expect(REVIEWER_INSTRUCTIONS).toContain("Issues Found");
			expect(REVIEWER_INSTRUCTIONS).toContain("Summary");
		});

		test("should contain verdict options", () => {
			// Given
			// When
			// Then
			expect(REVIEWER_INSTRUCTIONS).toContain("Would approve");
			expect(REVIEWER_INSTRUCTIONS).toContain("Would request changes");
			expect(REVIEWER_INSTRUCTIONS).toContain("Would block");
		});

		test("should instruct to only discuss code in the diff", () => {
			// Given
			// When
			// Then
			expect(REVIEWER_INSTRUCTIONS).toContain("ONLY discuss code that appears in the diff");
		});
	});

	describe("REVIEWER_PERSONALITY", () => {
		test("should be a non-empty string", () => {
			// Given
			// When
			// Then
			expect(typeof REVIEWER_PERSONALITY).toEqual("string");
			expect(REVIEWER_PERSONALITY.length).toBeGreaterThan(0);
		});

		test("should establish the role as a code reviewer", () => {
			// Given
			// When
			// Then
			expect(REVIEWER_PERSONALITY.toLowerCase()).toContain("code reviewer");
		});

		test("should include reviewer instructions", () => {
			// Given
			// When
			// Then
			expect(REVIEWER_PERSONALITY).toContain(REVIEWER_INSTRUCTIONS);
		});
	});

	describe("buildReviewPrompt", () => {
		const mockContext: ReviewContext = {
			branch: "feature/test-branch",
			files: ["src/file1.ts", "src/file2.ts"],
			fileCount: 2,
			mode: "working tree",
		};

		const mockDiff = `diff --git a/src/file1.ts b/src/file1.ts
--- a/src/file1.ts
+++ b/src/file1.ts
@@ -1,5 +1,6 @@
+import { something } from "./something";
 export function test() {
   return true;
 }`;

		test("should include the diff in code fences", () => {
			// Given
			// When
			const prompt = buildReviewPrompt(mockDiff, mockContext);

			// Then
			expect(prompt).toContain("```diff");
			expect(prompt).toContain(mockDiff);
			expect(prompt).toContain("```");
		});

		test("should include branch name", () => {
			// Given
			// When
			const prompt = buildReviewPrompt(mockDiff, mockContext);

			// Then
			expect(prompt).toContain("feature/test-branch");
		});

		test("should include review mode", () => {
			// Given
			// When
			const prompt = buildReviewPrompt(mockDiff, mockContext);

			// Then
			expect(prompt).toContain("working tree");
		});

		test("should include changed files list", () => {
			// Given
			// When
			const prompt = buildReviewPrompt(mockDiff, mockContext);

			// Then
			expect(prompt).toContain("src/file1.ts");
			expect(prompt).toContain("src/file2.ts");
		});

		test("should include file count", () => {
			// Given
			// When
			const prompt = buildReviewPrompt(mockDiff, mockContext);

			// Then
			expect(prompt).toContain("2");
		});

		test("should include reviewer personality", () => {
			// Given
			// When
			const prompt = buildReviewPrompt(mockDiff, mockContext);

			// Then
			expect(prompt).toContain(REVIEWER_PERSONALITY);
		});

		test("should include project standards", () => {
			// Given
			// When
			const prompt = buildReviewPrompt(mockDiff, mockContext);

			// Then
			expect(prompt).toContain(PROJECT_STANDARDS);
		});

		test("should include commits when provided", () => {
			// Given
			const contextWithCommits: ReviewContext = {
				...mockContext,
				commits: "abc123 feature(test): Add feature",
			};

			// When
			const prompt = buildReviewPrompt(mockDiff, contextWithCommits);

			// Then
			expect(prompt).toContain("abc123 feature(test): Add feature");
		});

		test("should handle context without files", () => {
			// Given
			const contextWithoutFiles: ReviewContext = {
				branch: "main",
				files: [],
				fileCount: 0,
				mode: "staged changes",
			};

			// When
			const prompt = buildReviewPrompt(mockDiff, contextWithoutFiles);

			// Then
			expect(prompt).toContain("main");
			expect(prompt).not.toContain("undefined");
		});
	});

	describe("buildCommitMessagePrompt", () => {
		test("should include commits in the prompt", () => {
			// Given
			const commits = "abc123 feature(website): Add feature\ndef456 bugfix(api): Fix bug";
			const branchName = "feature/my-feature";

			// When
			const prompt = buildCommitMessagePrompt(commits, branchName);

			// Then
			expect(prompt).toContain(commits);
		});

		test("should include branch name", () => {
			// Given
			const commits = "abc123 commit message";
			const branchName = "feature/test-branch";

			// When
			const prompt = buildCommitMessagePrompt(commits, branchName);

			// Then
			expect(prompt).toContain("feature/test-branch");
		});

		test("should include reviewer personality", () => {
			// Given
			const commits = "abc123 commit message";
			const branchName = "main";

			// When
			const prompt = buildCommitMessagePrompt(commits, branchName);

			// Then
			expect(prompt).toContain(REVIEWER_PERSONALITY);
		});

		test("should include project standards", () => {
			// Given
			const commits = "abc123 commit message";
			const branchName = "main";

			// When
			const prompt = buildCommitMessagePrompt(commits, branchName);

			// Then
			expect(prompt).toContain(PROJECT_STANDARDS);
		});

		test("should mention commit format requirements", () => {
			// Given
			const commits = "abc123 commit message";
			const branchName = "main";

			// When
			const prompt = buildCommitMessagePrompt(commits, branchName);

			// Then
			expect(prompt.toLowerCase()).toContain("commit format");
		});
	});

	describe("buildBatchReviewPrompt", () => {
		const mockContext: ReviewContext = {
			branch: "feature/batch-test",
			files: ["src/file1.ts"],
			fileCount: 1,
			mode: "working tree",
		};

		const mockDiff = `diff --git a/src/file1.ts b/src/file1.ts
+new line`;

		test("should include batch number information", () => {
			// Given
			const batchInfo = { current: 1, total: 3, files: ["src/file1.ts"] };

			// When
			const prompt = buildBatchReviewPrompt(mockDiff, mockContext, batchInfo, []);

			// Then
			expect(prompt).toContain("Batch 1/3");
		});

		test("should include files in the batch", () => {
			// Given
			const batchInfo = { current: 1, total: 2, files: ["src/a.ts", "src/b.ts"] };

			// When
			const prompt = buildBatchReviewPrompt(mockDiff, mockContext, batchInfo, []);

			// Then
			expect(prompt).toContain("src/a.ts");
			expect(prompt).toContain("src/b.ts");
		});

		test("should include the diff", () => {
			// Given
			const batchInfo = { current: 1, total: 1, files: ["src/file1.ts"] };

			// When
			const prompt = buildBatchReviewPrompt(mockDiff, mockContext, batchInfo, []);

			// Then
			expect(prompt).toContain(mockDiff);
		});

		test("should include branch name", () => {
			// Given
			const batchInfo = { current: 1, total: 1, files: ["src/file1.ts"] };

			// When
			const prompt = buildBatchReviewPrompt(mockDiff, mockContext, batchInfo, []);

			// Then
			expect(prompt).toContain("feature/batch-test");
		});

		test("should include previous issues when provided", () => {
			// Given
			const batchInfo = { current: 2, total: 3, files: ["src/file2.ts"] };
			const previousIssues = ["Issue 1 from batch 1", "Issue 2 from batch 1"];

			// When
			const prompt = buildBatchReviewPrompt(mockDiff, mockContext, batchInfo, previousIssues);

			// Then
			expect(prompt).toContain("Issue 1 from batch 1");
			expect(prompt).toContain("Issue 2 from batch 1");
			expect(prompt).toContain("Previous Batches");
		});

		test("should not include previous issues section when empty", () => {
			// Given
			const batchInfo = { current: 1, total: 2, files: ["src/file1.ts"] };

			// When
			const prompt = buildBatchReviewPrompt(mockDiff, mockContext, batchInfo, []);

			// Then
			expect(prompt).not.toContain("Previous Batches");
		});

		test("should instruct not to repeat previous issues", () => {
			// Given
			const batchInfo = { current: 2, total: 2, files: ["src/file2.ts"] };
			const previousIssues = ["Existing issue"];

			// When
			const prompt = buildBatchReviewPrompt(mockDiff, mockContext, batchInfo, previousIssues);

			// Then
			expect(prompt.toLowerCase()).toContain("do not repeat");
		});

		test("should specify batch output format", () => {
			// Given
			const batchInfo = { current: 1, total: 1, files: ["src/file1.ts"] };

			// When
			const prompt = buildBatchReviewPrompt(mockDiff, mockContext, batchInfo, []);

			// Then
			expect(prompt).toContain("Issues");
			expect(prompt).toContain("filename:line");
		});
	});

	describe("buildConsolidationPrompt", () => {
		const mockContext: ReviewContext = {
			branch: "feature/consolidation-test",
			files: ["src/file1.ts", "src/file2.ts"],
			fileCount: 2,
			mode: "branch diff (main...HEAD)",
		};

		test("should include file count", () => {
			// Given
			const issues = ["Issue 1", "Issue 2"];
			const fileCount = 5;

			// When
			const prompt = buildConsolidationPrompt(issues, mockContext, fileCount);

			// Then
			expect(prompt).toContain("5 files");
		});

		test("should include branch name", () => {
			// Given
			const issues = ["Issue 1"];
			const fileCount = 3;

			// When
			const prompt = buildConsolidationPrompt(issues, mockContext, fileCount);

			// Then
			expect(prompt).toContain("feature/consolidation-test");
		});

		test("should list all issues", () => {
			// Given
			const issues = ["Missing error handling in file.ts", "Unused import in utils.ts", "Type issue in api.ts"];
			const fileCount = 3;

			// When
			const prompt = buildConsolidationPrompt(issues, mockContext, fileCount);

			// Then
			issues.forEach((issue) => {
				expect(prompt).toContain(issue);
			});
		});

		test("should handle empty issues list", () => {
			// Given
			const issues: string[] = [];
			const fileCount = 2;

			// When
			const prompt = buildConsolidationPrompt(issues, mockContext, fileCount);

			// Then
			expect(prompt).toContain("No issues found");
		});

		test("should specify consolidated output format", () => {
			// Given
			const issues = ["Issue 1"];
			const fileCount = 1;

			// When
			const prompt = buildConsolidationPrompt(issues, mockContext, fileCount);

			// Then
			expect(prompt).toContain("Verdict");
			expect(prompt).toContain("Critical Issues");
			expect(prompt).toContain("Should Fix");
			expect(prompt).toContain("Nits");
			expect(prompt).toContain("Summary");
		});

		test("should include verdict options", () => {
			// Given
			const issues = ["Issue 1"];
			const fileCount = 1;

			// When
			const prompt = buildConsolidationPrompt(issues, mockContext, fileCount);

			// Then
			expect(prompt).toContain("Would approve");
			expect(prompt).toContain("Would request changes");
			expect(prompt).toContain("Would block");
		});

		test("should mention consolidation task", () => {
			// Given
			const issues = ["Issue 1", "Issue 2"];
			const fileCount = 2;

			// When
			const prompt = buildConsolidationPrompt(issues, mockContext, fileCount);

			// Then
			expect(prompt.toLowerCase()).toContain("consolidat");
		});
	});
});
