/**
 * @fileoverview Smart diff truncation for fitting within LLM context windows.
 *
 * LLMs have limited "context windows" - the maximum amount of text they can
 * process at once. This module helps us fit large diffs into that limit
 * intelligently, rather than just cutting them off arbitrarily.
 *
 * ## AI Concept: Context Windows
 *
 * Every LLM has a maximum context size measured in tokens:
 * - **GPT-3.5**: 4K-16K tokens
 * - **GPT-4**: 8K-128K tokens
 * - **Claude**: 100K-200K tokens
 * - **Local models (Ollama)**: Typically 4K-32K tokens
 *
 * Tokens ≈ characters / 4 (roughly).
 *
 * The context window must fit:
 * ```
 * [System Prompt] + [User Input] + [Model Output] ≤ Context Window
 * ```
 *
 * For us:
 * - System Prompt: ~800 tokens (personality, standards, instructions)
 * - User Input: The diff (variable, can be huge!)
 * - Model Output: ~500-1000 tokens (the review)
 *
 * So we have roughly 2000-3000 tokens for the diff in a 4K context model.
 *
 * ## AI Concept: Quality vs Quantity Tradeoff
 *
 * When diffs are too large, we have choices:
 *
 * 1. **Naive truncation**: Cut at character limit
 *    - Problem: May cut mid-file, losing context
 *    - Problem: Important files might be at the end and get cut
 *
 * 2. **Smart truncation** (what we do): Keep complete files, prioritize
 *    - Always include complete file diffs (never cut mid-file)
 *    - Prioritize code files over config/docs
 *    - Tell the user what was skipped
 *
 * 3. **Batching** (--all mode): Review everything in multiple passes
 *    - Complete coverage but slower (multiple LLM calls)
 *    - More expensive if using paid APIs
 *
 * ## AI Concept: Context Utilization
 *
 * It's important to use context efficiently:
 * - Lock files and generated code are low-value (skip them first)
 * - Source code is high-value (prioritize it)
 * - Tests are medium-value (include after main code)
 *
 * A reviewer who sees 100% of source code and 0% of package-lock.json
 * is more useful than one who sees 50% of each.
 */

/**
 * Result of smart truncation.
 */
export interface TruncateResult {
	/** The truncated diff content */
	diff: string;
	/** Files that were included in the truncated diff */
	included: string[];
	/** Files that were skipped due to size limits */
	skipped: string[];
	/** Whether any truncation occurred */
	wasTruncated: boolean;
}

/**
 * A single file's diff with metadata.
 */
interface FileDiff {
	/** The file path (e.g., "src/index.ts") */
	path: string;
	/** The complete diff content for this file */
	content: string;
	/** Priority for inclusion (lower = more important) */
	priority: number;
}

/**
 * File extension priorities for sorting.
 *
 * ## AI Concept: Content Prioritization
 *
 * Not all files are equally important for code review.
 * We rank by "review value" - how useful is this file to review?
 *
 * **High priority (10-15)**: Source code
 * - This is what you actually want reviewed
 * - TypeScript/JavaScript are the main codebase
 *
 * **Medium priority (30-40)**: Styles and tests
 * - Important but secondary to main logic
 * - Tests after source (review what's tested first)
 *
 * **Low priority (60-70)**: Config and docs
 * - Rarely have bugs, mostly just formatting
 * - Can be skipped if space is tight
 *
 * **Lowest priority (90)**: Generated files
 * - Lock files, build outputs, etc.
 * - Almost never need human review
 *
 * This prioritization ensures the LLM sees the most important
 * code first, even if we have to skip some files.
 */
const EXTENSION_PRIORITIES: Record<string, number> = {
	// Order matters! More specific extensions first (checked with endsWith)

	// Tests - important but after main code
	".spec.ts": 40,
	".spec.tsx": 40,
	".test.ts": 40,
	".test.tsx": 40,

	// Generated/lock files - almost never need review
	"-lock.json": 90,
	".lock": 90,

	// Source code - highest priority
	".ts": 10,
	".tsx": 10,
	".js": 15,
	".jsx": 15,

	// Styles and templates
	".scss": 30,
	".css": 30,
	".html": 35,

	// Config and docs
	".json": 60,
	".md": 65,
	".yml": 70,
	".yaml": 70
};

/**
 * Gets the priority for a file based on its extension.
 *
 * @param filePath - The file path to check
 * @returns Priority number (lower = more important)
 */
function getPriority(filePath: string): number {
	for (const [ext, priority] of Object.entries(EXTENSION_PRIORITIES)) {
		if (filePath.endsWith(ext)) {
			return priority;
		}
	}

	return 50; // Default priority for unknown extensions
}

/**
 * Extracts the file path from a diff header line.
 *
 * Git diff headers look like:
 * ```
 * diff --git a/src/index.ts b/src/index.ts
 * ```
 *
 * We extract "src/index.ts" from the "b/" path (the destination).
 *
 * @param diffHeader - The "diff --git" line
 * @returns The file path, or "unknown" if parsing fails
 */
function extractFilePath(diffHeader: string): string {
	const match = diffHeader.match(/b\/(.+)$/);

	return match ? match[1] : "unknown";
}

/**
 * Parses a complete diff into individual file diffs.
 *
 * @param diff - The complete git diff output
 * @returns Array of parsed file diffs with metadata
 */
function parseFileDiffs(diff: string): FileDiff[] {
	// Split on "diff --git" but keep the delimiter using lookahead
	const parts = diff.split(/(?=diff --git)/);

	return parts
		.filter((part) => part.trim().length > 0)
		.map((content) => {
			const firstLine = content.split("\n")[0];
			const path = extractFilePath(firstLine);

			return {
				path,
				content,
				priority: getPriority(path)
			};
		});
}

/**
 * Smartly truncates a diff to fit within a character limit.
 *
 * ## AI Concept: Preserving Semantic Units
 *
 * A key principle in prompt engineering: keep semantic units intact.
 *
 * For code review, a "semantic unit" is a complete file diff.
 * Half a file is useless - the LLM can't understand partial context.
 *
 * Our algorithm:
 * 1. Parse diff into complete file diffs
 * 2. Sort by priority (code > tests > config > generated)
 * 3. Add files one by one until we hit the limit
 * 4. Always include at least one file (even if oversized)
 * 5. Report what was skipped
 *
 * This ensures the LLM always sees complete, reviewable units.
 *
 * @param diff - The complete git diff to truncate
 * @param maxLength - Maximum character length for the result
 * @returns Truncation result with diff, included files, and skipped files
 */
export function smartTruncate(diff: string, maxLength: number): TruncateResult {
	// Fast path: if diff fits, return as-is
	if (diff.length <= maxLength) {
		const files = parseFileDiffs(diff);

		return {
			diff,
			included: files.map((file) => file.path),
			skipped: [],
			wasTruncated: false
		};
	}

	// Parse and sort by priority
	const fileDiffs = parseFileDiffs(diff);

	fileDiffs.sort((fileDiffA, fileDiffB) => fileDiffA.priority - fileDiffB.priority);

	const included: FileDiff[] = [];
	const skipped: string[] = [];
	let currentLength = 0;

	for (const fileDiff of fileDiffs) {
		const wouldExceed = currentLength + fileDiff.content.length > maxLength;

		if (wouldExceed && included.length > 0) {
			// Skip this file, but only if we already have content
			skipped.push(fileDiff.path);
		} else {
			// Include this file
			included.push(fileDiff);
			currentLength += fileDiff.content.length;
		}
	}

	// Reassemble the diff from included files
	const truncatedDiff = included.map((file) => file.content).join("");

	// Add a note about skipped files
	const skippedNote =
		skipped.length > 0
			? `\n\n[${skipped.length} file(s) skipped due to size: ${skipped.slice(0, 5).join(", ")}${skipped.length > 5 ? "..." : ""}]`
			: "";

	return {
		diff: truncatedDiff + skippedNote,
		included: included.map((file) => file.path),
		skipped,
		wasTruncated: true
	};
}

/**
 * A batch of files to review together.
 */
export interface DiffBatch {
	/** Batch number (1-indexed for display) */
	batchNumber: number;
	/** Total number of batches */
	totalBatches: number;
	/** The diff content for this batch */
	diff: string;
	/** Files included in this batch */
	files: string[];
}

/**
 * Splits a large diff into multiple batches that each fit within the size limit.
 *
 * ## AI Concept: Iterative Processing
 *
 * When content exceeds context limits, we can process it in batches.
 * Each batch is a separate LLM call with its own context.
 *
 * Tradeoffs:
 * - **Pro**: Complete coverage (every file gets reviewed)
 * - **Con**: Slower (multiple LLM calls)
 * - **Con**: More expensive (if using paid APIs)
 * - **Con**: Cross-file issues harder to spot
 *
 * Our approach mitigates the cross-file issue by passing previous
 * batch issues to subsequent batches (see prompts.ts buildBatchReviewPrompt).
 *
 * ## AI Concept: Bin Packing
 *
 * This is essentially a bin-packing problem:
 * - Bins = Batches (each with max capacity = maxLength)
 * - Items = File diffs (each with a size)
 * - Goal = Minimize number of bins while fitting all items
 *
 * We use a simple first-fit algorithm:
 * 1. Sort items by priority (code files first)
 * 2. Try to add each item to current bin
 * 3. If doesn't fit, start a new bin
 *
 * @param diff - The complete git diff
 * @param maxLength - Maximum characters per batch
 * @returns Array of batches
 */
export function splitIntoBatches(diff: string, maxLength: number): DiffBatch[] {
	const fileDiffs = parseFileDiffs(diff);

	// Sort by priority (code files first)
	fileDiffs.sort((fileDiffA, fileDiffB) => fileDiffA.priority - fileDiffB.priority);

	const batches: DiffBatch[] = [];
	let currentBatch: FileDiff[] = [];
	let currentLength = 0;

	for (const fileDiff of fileDiffs) {
		const fileLength = fileDiff.content.length;

		// If this file alone exceeds maxLength, it gets its own batch (truncated)
		if (fileLength > maxLength) {
			// Flush current batch first
			if (currentBatch.length > 0) {
				batches.push({
					batchNumber: batches.length + 1,
					totalBatches: 0,
					diff: currentBatch.map((file) => file.content).join(""),
					files: currentBatch.map((file) => file.path)
				});
				currentBatch = [];
				currentLength = 0;
			}

			// Add oversized file as its own batch (truncated with note)
			batches.push({
				batchNumber: batches.length + 1,
				totalBatches: 0,
				diff: fileDiff.content.substring(0, maxLength) + `\n\n[File truncated - ${fileDiff.path} exceeds ${maxLength} chars]`,
				files: [fileDiff.path]
			});

			continue;
		}

		// Would adding this file exceed the limit?
		if (currentLength + fileLength > maxLength && currentBatch.length > 0) {
			// Flush current batch
			batches.push({
				batchNumber: batches.length + 1,
				totalBatches: 0,
				diff: currentBatch.map((file) => file.content).join(""),
				files: currentBatch.map((file) => file.path)
			});
			currentBatch = [];
			currentLength = 0;
		}

		// Add file to current batch
		currentBatch.push(fileDiff);
		currentLength += fileLength;
	}

	// Don't forget the last batch
	if (currentBatch.length > 0) {
		batches.push({
			batchNumber: batches.length + 1,
			totalBatches: 0,
			diff: currentBatch.map((file) => file.content).join(""),
			files: currentBatch.map((file) => file.path)
		});
	}

	// Set totalBatches on all batches
	for (const batch of batches) {
		batch.totalBatches = batches.length;
	}

	return batches;
}
