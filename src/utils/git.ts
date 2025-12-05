/**
 * @fileoverview Git utilities for extracting diffs and branch information.
 *
 * This module provides functions to interact with Git via shell commands.
 * We use Node's `execSync` to run Git commands synchronously, which is fine
 * for a CLI tool where we need the results immediately.
 *
 * ## Key Git Concepts Used Here:
 *
 * ### Working Tree vs Staged vs Committed
 * - **Working tree**: Files as they exist on disk right now (uncommitted changes)
 * - **Staged (index)**: Changes you've `git add`ed, ready to commit
 * - **HEAD**: The last commit on your current branch
 *
 * ### Diff Variations
 * - `git diff` - Shows unstaged changes (working tree vs staged)
 * - `git diff --cached` - Shows staged changes (staged vs HEAD)
 * - `git diff HEAD` - Shows ALL uncommitted changes (working tree vs HEAD)
 * - `git diff main...HEAD` - Shows changes on current branch since it diverged from main
 *
 * ### The Three-Dot Syntax (A...B)
 * This is crucial for branch comparisons. `main...HEAD` means:
 * "Show me what's different in HEAD that isn't in main, starting from their common ancestor"
 *
 * This is different from `main..HEAD` (two dots) which shows commits, not file changes.
 *
 * @example
 * ```ts
 * // Get all uncommitted changes
 * const diff = getDiff();
 *
 * // Get only what you're about to commit
 * const stagedDiff = getDiff({ staged: true });
 *
 * // Get everything on this branch vs main
 * const branchDiff = getDiff({ branch: true });
 * ```
 */

import { execSync } from "child_process";

/**
 * Options for controlling what changes to review.
 *
 * @remarks
 * The `branch` option can be:
 * - `true` - Compare against the default main branch
 * - `string` - Compare against a specific branch name
 * - `undefined` - Don't do branch comparison
 */
export interface ReviewOptions {
	/** If true, only review staged changes (what would be committed) */
	staged?: boolean;
	/**
	 * Compare against a branch. If `true`, uses the default main branch.
	 * If a string, uses that branch name.
	 */
	branch?: string | boolean;
	/** If true, include untracked (new) files in the review */
	includeUntracked?: boolean;
}

/**
 * Context information about what's being reviewed.
 *
 * This is passed to the AI prompt so it understands what it's looking at.
 */
export interface ReviewContext {
	/** Current branch name (e.g., "feature/add-login") */
	branch: string;
	/** List of file paths that have changes */
	files: string[];
	/** Number of changed files (convenience property) */
	fileCount: number;
	/** Human-readable description of what's being reviewed */
	mode: string;
	/** Commit messages on this branch (only when using branch comparison) */
	commits?: string;
}

/**
 * Gets the absolute path to the repository root.
 *
 * @remarks
 * Uses `git rev-parse --show-toplevel` which returns the root directory
 * of the current Git repository. Useful for constructing absolute paths.
 *
 * @returns The absolute path to the repo root (e.g., "/Users/you/project")
 * @throws If not in a Git repository
 */
export function getRepoRoot(): string {
	return execSync("git rev-parse --show-toplevel", { encoding: "utf-8" }).trim();
}

/**
 * Gets the name of the currently checked-out branch.
 *
 * @remarks
 * Uses `git branch --show-current` which is cleaner than parsing `git branch` output.
 * Returns empty string if in detached HEAD state.
 *
 * @returns Branch name (e.g., "feature/add-login" or "develop")
 */
export function getCurrentBranch(): string {
	return execSync("git branch --show-current", { encoding: "utf-8" }).trim();
}

/**
 * Determines the repository's main/default branch name.
 *
 * @remarks
 * Different repos use different conventions (main, master, develop, etc.).
 * This function tries multiple approaches to find the right one:
 *
 * 1. First, checks `refs/remotes/origin/HEAD` - this is where Git stores
 *    what the remote considers the default branch
 * 2. If that fails, checks if a branch named "main" exists
 * 3. Falls back to "master" as a last resort
 *
 * The `2>/dev/null` redirects stderr to suppress error messages when
 * commands fail (which is expected in some cases).
 *
 * @returns The main branch name (e.g., "main", "master", "develop")
 */
export function getMainBranch(): string {
	try {
		// Try to get the default branch from the remote's HEAD reference
		// This is set when you clone a repo and reflects what GitHub/GitLab considers "default"
		const result = execSync("git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null", { encoding: "utf-8" }).trim();

		// Result is like "refs/remotes/origin/main" - we just want "main"
		return result.replace("refs/remotes/origin/", "");
	} catch {
		// Remote HEAD might not be set (fresh repo, or never fetched)
		try {
			// Check if "main" branch exists locally
			execSync("git rev-parse --verify main 2>/dev/null");

			return "main";
		} catch {
			// Fall back to "master" (older convention)
			return "master";
		}
	}
}

/**
 * Gets the diff for staged changes only.
 *
 * @remarks
 * Staged changes are what you've `git add`ed but not yet committed.
 * This is useful for reviewing what you're about to commit.
 *
 * `git diff --cached` compares the staging area (index) against HEAD.
 * The `--cached` flag is synonymous with `--staged`.
 *
 * @returns Unified diff output as a string
 */
export function getStagedDiff(): string {
	return execSync("git diff --cached", { encoding: "utf-8" });
}

/**
 * Gets the diff for unstaged changes only.
 *
 * @remarks
 * Unstaged changes are modifications to tracked files that haven't been
 * `git add`ed yet. This does NOT include untracked (new) files.
 *
 * Plain `git diff` compares working tree against the staging area.
 *
 * @returns Unified diff output as a string
 */
export function getUnstagedDiff(): string {
	return execSync("git diff", { encoding: "utf-8" });
}

/**
 * Gets all uncommitted changes (both staged and unstaged).
 *
 * @remarks
 * `git diff HEAD` compares your working tree directly against the last commit,
 * showing everything that would be different if you committed all changes.
 *
 * This is typically what you want for a general "review my work" scenario.
 *
 * Note: Still doesn't include untracked files (new files never added to Git).
 *
 * @returns Unified diff output as a string
 */
export function getAllChangesDiff(): string {
	return execSync("git diff HEAD", { encoding: "utf-8" });
}

/**
 * Gets a list of untracked files (new files not yet added to git).
 *
 * @remarks
 * Uses `git ls-files --others --exclude-standard` which lists files that:
 * - Are not tracked by git (--others)
 * - Are not ignored by .gitignore (--exclude-standard)
 *
 * @returns Array of untracked file paths
 */
export function getUntrackedFiles(): string[] {
	return execSync("git ls-files --others --exclude-standard", { encoding: "utf-8" }).trim().split("\n").filter(Boolean);
}

/**
 * Creates a diff-like output for an untracked file.
 *
 * @remarks
 * Since `git diff` doesn't show untracked files, we need to create a
 * synthetic diff that shows the entire file as added (all lines with +).
 *
 * This mimics the format of `git diff` so the LLM can understand it:
 * ```
 * diff --git a/path/to/file b/path/to/file
 * new file mode 100644
 * --- /dev/null
 * +++ b/path/to/file
 * @@ -0,0 +1,N @@
 * +line 1
 * +line 2
 * ...
 * ```
 *
 * @param filePath - Path to the untracked file
 * @returns Diff-formatted string showing the file as newly added
 */
export function createDiffForUntrackedFile(filePath: string): string {
	try {
		const content = execSync(`cat "${filePath}"`, { encoding: "utf-8" });
		const lines = content.split("\n");

		// Build a synthetic diff header
		const header = [
			`diff --git a/${filePath} b/${filePath}`,
			"new file mode 100644",
			"--- /dev/null",
			`+++ b/${filePath}`,
			`@@ -0,0 +1,${lines.length} @@`
		].join("\n");

		// Add + prefix to each line (showing as added)
		const diffLines = lines.map((line) => `+${line}`).join("\n");

		return `${header}\n${diffLines}`;
	} catch {
		// File might not exist or be readable
		return "";
	}
}

/**
 * Gets diff output for all untracked files.
 *
 * @returns Combined diff output for all untracked files
 */
export function getUntrackedDiff(): string {
	const untrackedFiles = getUntrackedFiles();

	if (untrackedFiles.length === 0) {
		return "";
	}

	return untrackedFiles
		.map((filePath) => createDiffForUntrackedFile(filePath))
		.filter(Boolean)
		.join("\n\n");
}

/**
 * Gets the diff between the current branch and a target branch.
 *
 * @remarks
 * Uses the three-dot syntax (`target...HEAD`) which shows changes
 * introduced on the current branch since it diverged from target.
 *
 * ### Why three dots?
 * ```
 *       A---B---C  (feature branch, HEAD)
 *      /
 * D---E---F---G    (main)
 * ```
 *
 * - `main...HEAD` shows changes in A, B, C (what feature branch added)
 * - `main..HEAD` would show commits A, B, C (for `git log`)
 * - `git diff main HEAD` would also include F, G (not what we want)
 *
 * The three-dot syntax finds the merge-base (E) and diffs from there.
 *
 * @param targetBranch - Branch to compare against (defaults to main branch)
 * @returns Unified diff output as a string
 */
export function getBranchDiff(targetBranch?: string): string {
	const target = targetBranch || getMainBranch();

	return execSync(`git diff ${target}...HEAD`, { encoding: "utf-8" });
}

/**
 * Gets a list of files that have changes.
 *
 * @remarks
 * The `--name-only` flag makes Git output just file paths instead of
 * the full diff. This is useful for displaying "Files changed: foo.ts, bar.ts"
 *
 * We split on newlines and filter out empty strings (the last split often
 * produces an empty string due to trailing newline).
 *
 * For the default case (no target branch), we combine staged and unstaged
 * files to catch newly added files that aren't in HEAD yet.
 *
 * @param targetBranch - If provided, compares against this branch; otherwise uses HEAD
 * @returns Array of file paths relative to repo root
 *
 * @example
 * ```ts
 * getChangedFiles()
 * // => ["src/index.ts", "package.json"]
 *
 * getChangedFiles("main")
 * // => ["src/feature.ts", "tests/feature.test.ts"]
 * ```
 */
export function getChangedFiles(targetBranch?: string): string[] {
	if (targetBranch) {
		return execSync(`git diff --name-only ${targetBranch}...HEAD`, { encoding: "utf-8" }).trim().split("\n").filter(Boolean);
	}

	// Combine staged and unstaged files to catch new files
	const staged = execSync("git diff --cached --name-only", { encoding: "utf-8" }).trim().split("\n").filter(Boolean);
	const unstaged = execSync("git diff --name-only", { encoding: "utf-8" }).trim().split("\n").filter(Boolean);

	// Use Set to deduplicate (a file could appear in both if partially staged)
	return [...new Set([...staged, ...unstaged])];
}

/**
 * Gets commit messages for commits on the current branch not in target.
 *
 * @remarks
 * Uses two-dot syntax (`target..HEAD`) which shows commits reachable from HEAD
 * but not from target. This is the commit equivalent of the diff three-dot syntax.
 *
 * The `--oneline` flag gives us compact output: "abc1234 Commit message"
 *
 * This is useful for reviewing commit message quality alongside code changes.
 *
 * @param targetBranch - Branch to compare against (defaults to main branch)
 * @returns Newline-separated list of commit summaries, or empty string if none
 */
export function getBranchCommits(targetBranch?: string): string {
	const target = targetBranch || getMainBranch();

	try {
		return execSync(`git log ${target}..HEAD --oneline`, { encoding: "utf-8" }).trim();
	} catch {
		// Can fail if branches don't share history or target doesn't exist
		return "";
	}
}

/**
 * Checks if there are any changes to review.
 *
 * @remarks
 * This is a quick check to avoid running the AI on an empty diff.
 * We use `--name-only` because we only care IF there are changes,
 * not what they are (faster than getting full diff).
 *
 * The function checks different things based on options:
 * - `staged: true` → Are there staged changes?
 * - `branch: true/string` → Are there changes vs the target branch?
 * - Default → Are there any uncommitted changes (staged OR unstaged)?
 *
 * ### Why check both staged and unstaged?
 *
 * `git diff HEAD` shows changes in tracked files vs last commit, but it may
 * miss newly staged files in some edge cases. To be thorough, we check:
 * - `git diff HEAD` for working tree changes
 * - `git diff --cached` for staged changes (including new files)
 *
 * @param options - What type of changes to check for
 * @returns True if there are changes to review, false otherwise
 */
export function hasChanges(options: ReviewOptions = {}): boolean {
	try {
		if (options.staged) {
			const staged = execSync("git diff --cached --name-only", { encoding: "utf-8" }).trim();

			return staged.length > 0;
		}

		if (options.branch) {
			const target = typeof options.branch === "string" ? options.branch : getMainBranch();
			const diff = execSync(`git diff --name-only ${target}...HEAD`, { encoding: "utf-8" }).trim();

			return diff.length > 0;
		}

		// Default: check for ANY uncommitted changes (staged + unstaged)
		// Check staged first (includes newly added files)
		const staged = execSync("git diff --cached --name-only", { encoding: "utf-8" }).trim();

		if (staged.length > 0) {
			return true;
		}

		// Then check unstaged
		const unstaged = execSync("git diff --name-only", { encoding: "utf-8" }).trim();

		if (unstaged.length > 0) {
			return true;
		}

		// Finally check untracked files (if option enabled)
		if (options.includeUntracked) {
			const untracked = getUntrackedFiles();

			return untracked.length > 0;
		}

		return false;
	} catch {
		// If Git commands fail (not a repo, etc.), report no changes
		return false;
	}
}

/**
 * Gets the appropriate diff based on the review options.
 *
 * @remarks
 * This is a convenience function that routes to the right diff function
 * based on what the user wants to review. It centralizes the logic
 * so callers don't need to know about the different diff types.
 *
 * Priority order:
 * 1. Staged changes (most specific)
 * 2. Branch comparison
 * 3. All uncommitted changes (default) - combines staged + unstaged
 *
 * ### Why combine staged and unstaged?
 *
 * `git diff HEAD` should show both, but for newly added files (not yet in HEAD),
 * we need to also get `git diff --cached` to see the new file contents.
 *
 * @param options - What type of changes to get
 * @returns Unified diff output as a string
 */
export function getDiff(options: ReviewOptions = {}): string {
	// If staged changes requested, return staged diff
	if (options.staged) {
		return getStagedDiff();
	}

	// If branch diff requested, return branch diff
	if (options.branch) {
		const target = typeof options.branch === "string" ? options.branch : getMainBranch();

		return getBranchDiff(target);
	}

	// Default: combine staged, unstaged, and optionally untracked diffs
	const parts: string[] = [];

	const staged = getStagedDiff();

	if (staged) parts.push(staged);

	const unstaged = getUnstagedDiff();

	if (unstaged) parts.push(unstaged);

	// Include untracked files if option enabled
	if (options.includeUntracked) {
		const untracked = getUntrackedDiff();

		if (untracked) parts.push(untracked);
	}

	return parts.join("\n");
}

/**
 * Builds a context object describing what's being reviewed.
 *
 * @remarks
 * This context is included in the AI prompt so it understands:
 * - What branch you're on
 * - What files are affected
 * - What type of review this is (staged, branch diff, working tree)
 * - What commits are being reviewed (for branch mode)
 *
 * The AI uses this to provide more relevant feedback (e.g., checking
 * commit message format when reviewing a branch).
 *
 * @param options - What type of review is happening
 * @returns Context object with review metadata
 *
 * @example
 * ```ts
 * getReviewContext({ branch: true })
 * // => {
 * //   branch: "feature/add-login",
 * //   files: ["src/auth.ts", "src/login.tsx"],
 * //   fileCount: 2,
 * //   mode: "branch diff (main...HEAD)",
 * //   commits: "abc123 Add login form\ndef456 Add auth service"
 * // }
 * ```
 */
export function getReviewContext(options: ReviewOptions = {}): ReviewContext {
	const currentBranch = getCurrentBranch();
	const targetBranch = typeof options.branch === "string" ? options.branch : undefined;
	const files = options.branch ? getChangedFiles(targetBranch || getMainBranch()) : getChangedFiles();

	const context: ReviewContext = {
		branch: currentBranch,
		files,
		fileCount: files.length,
		mode: "working tree"
	};

	if (options.staged) {
		context.mode = "staged changes";
	} else if (options.branch) {
		const target = targetBranch || getMainBranch();

		context.mode = `branch diff (${target}...HEAD)`;
		context.commits = getBranchCommits(target);
	}

	return context;
}
