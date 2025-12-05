/**
 * Tests for the git module.
 *
 * @remarks
 * These tests mock child_process.execSync to test git utility functions
 * without requiring actual git commands to run.
 *
 * Uses jest.unstable_mockModule for ESM compatibility.
 */

import { beforeEach, describe, expect, jest, test } from "@jest/globals";

// Create mock function before module import
const mockExecSync = jest.fn<(cmd: string, opts?: { encoding: string }) => string>();

// Mock the child_process module before importing git.js
jest.unstable_mockModule("child_process", () => ({
	execSync: mockExecSync
}));

// Dynamic import after mock setup (required for ESM)
const {
	createDiffForUntrackedFile,
	getAllChangesDiff,
	getBranchCommits,
	getBranchDiff,
	getChangedFiles,
	getCurrentBranch,
	getDiff,
	getMainBranch,
	getRepoRoot,
	getReviewContext,
	getStagedDiff,
	getUntrackedDiff,
	getUntrackedFiles,
	getUnstagedDiff,
	hasChanges
} = await import("./git");

// Import types separately (they don't need mocking)
import type { ReviewContext, ReviewOptions } from "./git";

describe("Git module", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("getRepoRoot", () => {
		test("should return the repository root path", () => {
			// Given
			mockExecSync.mockReturnValueOnce("/Users/test/project\n");

			// When
			const result = getRepoRoot();

			// Then
			expect(result).toEqual("/Users/test/project");
			expect(mockExecSync).toHaveBeenCalledWith("git rev-parse --show-toplevel", { encoding: "utf-8" });
		});
	});

	describe("getCurrentBranch", () => {
		test("should return the current branch name", () => {
			// Given
			mockExecSync.mockReturnValueOnce("feature/test-branch\n");

			// When
			const result = getCurrentBranch();

			// Then
			expect(result).toEqual("feature/test-branch");
			expect(mockExecSync).toHaveBeenCalledWith("git branch --show-current", { encoding: "utf-8" });
		});

		test("should return empty string for detached HEAD", () => {
			// Given
			mockExecSync.mockReturnValueOnce("\n");

			// When
			const result = getCurrentBranch();

			// Then
			expect(result).toEqual("");
		});
	});

	describe("getMainBranch", () => {
		test("should return main branch from remote HEAD", () => {
			// Given
			mockExecSync.mockReturnValueOnce("refs/remotes/origin/main\n");

			// When
			const result = getMainBranch();

			// Then
			expect(result).toEqual("main");
		});

		test("should return main if remote HEAD fails but main exists", () => {
			// Given
			mockExecSync
				.mockImplementationOnce(() => {
					throw new Error("fatal: ref refs/remotes/origin/HEAD is not a symbolic ref");
				})
				.mockReturnValueOnce(""); // git rev-parse --verify main succeeds

			// When
			const result = getMainBranch();

			// Then
			expect(result).toEqual("main");
		});

		test("should return master as fallback", () => {
			// Given
			mockExecSync
				.mockImplementationOnce(() => {
					throw new Error("fatal: ref refs/remotes/origin/HEAD is not a symbolic ref");
				})
				.mockImplementationOnce(() => {
					throw new Error("fatal: Needed a single revision");
				});

			// When
			const result = getMainBranch();

			// Then
			expect(result).toEqual("master");
		});
	});

	describe("getStagedDiff", () => {
		test("should return staged diff output", () => {
			// Given
			const expectedDiff = "diff --git a/file.ts b/file.ts\n+new line";

			mockExecSync.mockReturnValueOnce(expectedDiff);

			// When
			const result = getStagedDiff();

			// Then
			expect(result).toEqual(expectedDiff);
			expect(mockExecSync).toHaveBeenCalledWith("git diff --cached", { encoding: "utf-8" });
		});
	});

	describe("getUnstagedDiff", () => {
		test("should return unstaged diff output", () => {
			// Given
			const expectedDiff = "diff --git a/file.ts b/file.ts\n-old line\n+new line";

			mockExecSync.mockReturnValueOnce(expectedDiff);

			// When
			const result = getUnstagedDiff();

			// Then
			expect(result).toEqual(expectedDiff);
			expect(mockExecSync).toHaveBeenCalledWith("git diff", { encoding: "utf-8" });
		});
	});

	describe("getAllChangesDiff", () => {
		test("should return all changes diff output", () => {
			// Given
			const expectedDiff = "diff --git a/file.ts b/file.ts\n+all changes";

			mockExecSync.mockReturnValueOnce(expectedDiff);

			// When
			const result = getAllChangesDiff();

			// Then
			expect(result).toEqual(expectedDiff);
			expect(mockExecSync).toHaveBeenCalledWith("git diff HEAD", { encoding: "utf-8" });
		});
	});

	describe("getUntrackedFiles", () => {
		test("should return array of untracked file paths", () => {
			// Given
			mockExecSync.mockReturnValueOnce("new-file.ts\nanother-file.ts\n");

			// When
			const result = getUntrackedFiles();

			// Then
			expect(result).toEqual(["new-file.ts", "another-file.ts"]);
		});

		test("should return empty array when no untracked files", () => {
			// Given
			mockExecSync.mockReturnValueOnce("\n");

			// When
			const result = getUntrackedFiles();

			// Then
			expect(result).toEqual([]);
		});
	});

	describe("createDiffForUntrackedFile", () => {
		test("should create synthetic diff for untracked file", () => {
			// Given
			mockExecSync.mockReturnValueOnce("line 1\nline 2\nline 3");

			// When
			const result = createDiffForUntrackedFile("src/new-file.ts");

			// Then
			expect(result).toContain("diff --git a/src/new-file.ts b/src/new-file.ts");
			expect(result).toContain("new file mode 100644");
			expect(result).toContain("--- /dev/null");
			expect(result).toContain("+++ b/src/new-file.ts");
			expect(result).toContain("+line 1");
			expect(result).toContain("+line 2");
			expect(result).toContain("+line 3");
		});

		test("should return empty string if file cannot be read", () => {
			// Given
			mockExecSync.mockImplementationOnce(() => {
				throw new Error("cat: file not found");
			});

			// When
			const result = createDiffForUntrackedFile("nonexistent.ts");

			// Then
			expect(result).toEqual("");
		});
	});

	describe("getUntrackedDiff", () => {
		test("should return combined diff for all untracked files", () => {
			// Given
			mockExecSync
				.mockReturnValueOnce("file1.ts\nfile2.ts\n") // getUntrackedFiles
				.mockReturnValueOnce("content of file 1") // cat file1.ts
				.mockReturnValueOnce("content of file 2"); // cat file2.ts

			// When
			const result = getUntrackedDiff();

			// Then
			expect(result).toContain("diff --git a/file1.ts b/file1.ts");
			expect(result).toContain("diff --git a/file2.ts b/file2.ts");
		});

		test("should return empty string when no untracked files", () => {
			// Given
			mockExecSync.mockReturnValueOnce("\n");

			// When
			const result = getUntrackedDiff();

			// Then
			expect(result).toEqual("");
		});
	});

	describe("getBranchDiff", () => {
		test("should return branch diff against specified target", () => {
			// Given
			const expectedDiff = "diff --git a/file.ts b/file.ts\n+branch changes";

			mockExecSync.mockReturnValueOnce(expectedDiff);

			// When
			const result = getBranchDiff("develop");

			// Then
			expect(result).toEqual(expectedDiff);
			expect(mockExecSync).toHaveBeenCalledWith("git diff develop...HEAD", { encoding: "utf-8" });
		});

		test("should use main branch when no target specified", () => {
			// Given
			mockExecSync
				.mockReturnValueOnce("refs/remotes/origin/main\n") // getMainBranch
				.mockReturnValueOnce("diff output"); // getBranchDiff

			// When
			getBranchDiff();

			// Then
			expect(mockExecSync).toHaveBeenLastCalledWith("git diff main...HEAD", { encoding: "utf-8" });
		});
	});

	describe("getChangedFiles", () => {
		test("should return files changed against target branch", () => {
			// Given
			mockExecSync.mockReturnValueOnce("src/file1.ts\nsrc/file2.ts\n");

			// When
			const result = getChangedFiles("main");

			// Then
			expect(result).toEqual(["src/file1.ts", "src/file2.ts"]);
			expect(mockExecSync).toHaveBeenCalledWith("git diff --name-only main...HEAD", { encoding: "utf-8" });
		});

		test("should combine staged and unstaged files when no target branch", () => {
			// Given
			mockExecSync
				.mockReturnValueOnce("staged-file.ts\n") // staged
				.mockReturnValueOnce("unstaged-file.ts\n"); // unstaged

			// When
			const result = getChangedFiles();

			// Then
			expect(result).toEqual(["staged-file.ts", "unstaged-file.ts"]);
		});

		test("should deduplicate files that appear in both staged and unstaged", () => {
			// Given
			mockExecSync
				.mockReturnValueOnce("common-file.ts\n") // staged
				.mockReturnValueOnce("common-file.ts\n"); // unstaged

			// When
			const result = getChangedFiles();

			// Then
			expect(result).toEqual(["common-file.ts"]);
		});
	});

	describe("getBranchCommits", () => {
		test("should return commit messages", () => {
			// Given
			mockExecSync
				.mockReturnValueOnce("refs/remotes/origin/main\n") // getMainBranch
				.mockReturnValueOnce("abc123 First commit\ndef456 Second commit\n");

			// When
			const result = getBranchCommits();

			// Then
			expect(result).toEqual("abc123 First commit\ndef456 Second commit");
		});

		test("should return empty string on error", () => {
			// Given
			mockExecSync
				.mockReturnValueOnce("refs/remotes/origin/main\n") // getMainBranch
				.mockImplementationOnce(() => {
					throw new Error("fatal: bad revision");
				});

			// When
			const result = getBranchCommits();

			// Then
			expect(result).toEqual("");
		});

		test("should use specified target branch", () => {
			// Given
			mockExecSync.mockReturnValueOnce("abc123 Commit\n");

			// When
			getBranchCommits("develop");

			// Then
			expect(mockExecSync).toHaveBeenCalledWith("git log develop..HEAD --oneline", { encoding: "utf-8" });
		});
	});

	describe("hasChanges", () => {
		test("should return true when staged changes exist", () => {
			// Given
			mockExecSync.mockReturnValueOnce("file.ts\n");

			// When
			const result = hasChanges({ staged: true });

			// Then
			expect(result).toEqual(true);
			expect(mockExecSync).toHaveBeenCalledWith("git diff --cached --name-only", { encoding: "utf-8" });
		});

		test("should return false when no staged changes", () => {
			// Given
			mockExecSync.mockReturnValueOnce("\n");

			// When
			const result = hasChanges({ staged: true });

			// Then
			expect(result).toEqual(false);
		});

		test("should return true when branch has changes", () => {
			// Given
			mockExecSync
				.mockReturnValueOnce("refs/remotes/origin/main\n") // getMainBranch
				.mockReturnValueOnce("file.ts\n");

			// When
			const result = hasChanges({ branch: true });

			// Then
			expect(result).toEqual(true);
		});

		test("should use string branch name when provided", () => {
			// Given
			mockExecSync.mockReturnValueOnce("file.ts\n");

			// When
			const result = hasChanges({ branch: "develop" });

			// Then
			expect(mockExecSync).toHaveBeenCalledWith("git diff --name-only develop...HEAD", { encoding: "utf-8" });
			expect(result).toEqual(true);
		});

		test("should return false when no branch changes", () => {
			// Given
			mockExecSync
				.mockReturnValueOnce("refs/remotes/origin/main\n") // getMainBranch
				.mockReturnValueOnce("\n");

			// When
			const result = hasChanges({ branch: true });

			// Then
			expect(result).toEqual(false);
		});

		test("should check staged then unstaged for default case", () => {
			// Given
			mockExecSync
				.mockReturnValueOnce("\n") // no staged
				.mockReturnValueOnce("file.ts\n"); // has unstaged

			// When
			const result = hasChanges();

			// Then
			expect(result).toEqual(true);
		});

		test("should return true if only staged changes in default case", () => {
			// Given
			mockExecSync.mockReturnValueOnce("staged-file.ts\n"); // has staged

			// When
			const result = hasChanges();

			// Then
			expect(result).toEqual(true);
		});

		test("should check untracked files when option enabled", () => {
			// Given
			mockExecSync
				.mockReturnValueOnce("\n") // no staged
				.mockReturnValueOnce("\n") // no unstaged
				.mockReturnValueOnce("new-file.ts\n"); // has untracked

			// When
			const result = hasChanges({ includeUntracked: true });

			// Then
			expect(result).toEqual(true);
		});

		test("should return false when no changes at all", () => {
			// Given
			mockExecSync
				.mockReturnValueOnce("\n") // no staged
				.mockReturnValueOnce("\n"); // no unstaged

			// When
			const result = hasChanges();

			// Then
			expect(result).toEqual(false);
		});

		test("should return false when git command fails", () => {
			// Given
			mockExecSync.mockImplementationOnce(() => {
				throw new Error("fatal: not a git repository");
			});

			// When
			const result = hasChanges();

			// Then
			expect(result).toEqual(false);
		});
	});

	describe("getDiff", () => {
		test("should return staged diff when staged option is true", () => {
			// Given
			mockExecSync.mockReturnValueOnce("staged diff content");

			// When
			const result = getDiff({ staged: true });

			// Then
			expect(result).toEqual("staged diff content");
			expect(mockExecSync).toHaveBeenCalledWith("git diff --cached", { encoding: "utf-8" });
		});

		test("should return branch diff when branch option is true", () => {
			// Given
			mockExecSync
				.mockReturnValueOnce("refs/remotes/origin/main\n") // getMainBranch
				.mockReturnValueOnce("branch diff content");

			// When
			const result = getDiff({ branch: true });

			// Then
			expect(result).toEqual("branch diff content");
		});

		test("should return branch diff against specified branch", () => {
			// Given
			mockExecSync.mockReturnValueOnce("develop branch diff");

			// When
			getDiff({ branch: "develop" });

			// Then
			expect(mockExecSync).toHaveBeenCalledWith("git diff develop...HEAD", { encoding: "utf-8" });
		});

		test("should combine staged and unstaged diffs by default", () => {
			// Given
			mockExecSync
				.mockReturnValueOnce("staged content") // getStagedDiff
				.mockReturnValueOnce("unstaged content"); // getUnstagedDiff

			// When
			const result = getDiff();

			// Then
			expect(result).toContain("staged content");
			expect(result).toContain("unstaged content");
		});

		test("should include untracked files when option enabled", () => {
			// Given
			mockExecSync
				.mockReturnValueOnce("staged content") // getStagedDiff
				.mockReturnValueOnce("unstaged content") // getUnstagedDiff
				.mockReturnValueOnce("newfile.ts\n") // getUntrackedFiles
				.mockReturnValueOnce("new file content"); // cat newfile.ts

			// When
			const result = getDiff({ includeUntracked: true });

			// Then
			expect(result).toContain("staged content");
			expect(result).toContain("unstaged content");
			expect(result).toContain("newfile.ts");
		});

		test("should handle empty staged diff", () => {
			// Given
			mockExecSync
				.mockReturnValueOnce("") // empty staged
				.mockReturnValueOnce("unstaged content"); // has unstaged

			// When
			const result = getDiff();

			// Then
			expect(result).toEqual("unstaged content");
		});

		test("should handle empty unstaged diff", () => {
			// Given
			mockExecSync
				.mockReturnValueOnce("staged content") // has staged
				.mockReturnValueOnce(""); // empty unstaged

			// When
			const result = getDiff();

			// Then
			expect(result).toEqual("staged content");
		});
	});

	describe("getReviewContext", () => {
		test("should return context for working tree review", () => {
			// Given
			mockExecSync
				.mockReturnValueOnce("feature/test\n") // getCurrentBranch
				.mockReturnValueOnce("file1.ts\n") // getChangedFiles - staged
				.mockReturnValueOnce("file2.ts\n"); // getChangedFiles - unstaged

			// When
			const result = getReviewContext();

			// Then
			expect(result.branch).toEqual("feature/test");
			expect(result.mode).toEqual("working tree");
			expect(result.fileCount).toEqual(2);
			expect(result.commits).toBeUndefined();
		});

		test("should return context for staged review", () => {
			// Given
			mockExecSync
				.mockReturnValueOnce("feature/staged\n") // getCurrentBranch
				.mockReturnValueOnce("staged-file.ts\n") // getChangedFiles - staged
				.mockReturnValueOnce("\n"); // getChangedFiles - unstaged

			// When
			const result = getReviewContext({ staged: true });

			// Then
			expect(result.mode).toEqual("staged changes");
		});

		test("should return context for branch review with default main", () => {
			// Given
			mockExecSync
				.mockReturnValueOnce("feature/branch\n") // getCurrentBranch
				.mockReturnValueOnce("refs/remotes/origin/main\n") // getMainBranch for getChangedFiles
				.mockReturnValueOnce("changed-file.ts\n") // getChangedFiles
				.mockReturnValueOnce("refs/remotes/origin/main\n") // getMainBranch for mode
				.mockReturnValueOnce("abc123 Commit message\n"); // getBranchCommits

			// When
			const result = getReviewContext({ branch: true });

			// Then
			expect(result.mode).toEqual("branch diff (main...HEAD)");
			expect(result.commits).toEqual("abc123 Commit message");
		});

		test("should return context for branch review with specific target", () => {
			// Given
			mockExecSync
				.mockReturnValueOnce("feature/custom\n") // getCurrentBranch
				.mockReturnValueOnce("changed-file.ts\n") // getChangedFiles with target
				.mockReturnValueOnce("def456 Another commit\n"); // getBranchCommits

			// When
			const result = getReviewContext({ branch: "develop" });

			// Then
			expect(result.mode).toEqual("branch diff (develop...HEAD)");
			expect(result.commits).toEqual("def456 Another commit");
		});
	});

	describe("ReviewContext type", () => {
		test("should have required properties", () => {
			// Given
			const context: ReviewContext = {
				branch: "feature/test",
				files: ["src/file1.ts", "src/file2.ts"],
				fileCount: 2,
				mode: "working tree"
			};

			// When
			// Then
			expect(context.branch).toEqual("feature/test");
			expect(context.files).toHaveLength(2);
			expect(context.fileCount).toEqual(2);
			expect(context.mode).toEqual("working tree");
		});

		test("should support optional commits property", () => {
			// Given
			const contextWithCommits: ReviewContext = {
				branch: "feature/test",
				files: ["src/file.ts"],
				fileCount: 1,
				mode: "branch diff (main...HEAD)",
				commits: "abc123 First commit\ndef456 Second commit"
			};

			// When
			// Then
			expect(contextWithCommits.commits).toBeDefined();
			expect(contextWithCommits.commits).toContain("abc123");
		});
	});

	describe("ReviewOptions type", () => {
		test("should support all option combinations", () => {
			// Given
			const options: ReviewOptions = {
				staged: true,
				branch: "develop",
				includeUntracked: true
			};

			// When
			// Then
			expect(options.staged).toEqual(true);
			expect(options.branch).toEqual("develop");
			expect(options.includeUntracked).toEqual(true);
		});
	});
});
