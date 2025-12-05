import { smartTruncate, splitIntoBatches } from "./truncate";

describe("Truncate module", () => {
	/**
	 * Creates a mock git diff for a single file.
	 * @param path - The file path for the diff
	 * @param lineCount - Number of lines to include in the diff
	 * @returns A formatted git diff string
	 */
	function createFileDiff(path: string, lineCount = 10): string {
		const lines = Array.from({ length: lineCount }, (_, i) => `+line ${i + 1}`).join("\n");

		return `diff --git a/${path} b/${path}
--- a/${path}
+++ b/${path}
@@ -1,${lineCount} +1,${lineCount} @@
${lines}`;
	}

	/**
	 * Creates a mock git diff containing multiple files.
	 * @param files - Array of file configurations with path and optional line count
	 * @returns A formatted git diff string with multiple file diffs
	 */
	function createMultiFileDiff(files: { path: string; lineCount?: number }[]): string {
		return files.map((file) => createFileDiff(file.path, file.lineCount ?? 10)).join("\n");
	}

	describe("smartTruncate", () => {
		describe("when diff fits within limit", () => {
			test("should return the original diff unchanged", () => {
				// Given
				const diff = createFileDiff("src/index.ts", 5);
				const maxLength = 10000;

				// When
				const result = smartTruncate(diff, maxLength);

				// Then
				expect(result.wasTruncated).toEqual(false);
				expect(result.diff).toEqual(diff);
				expect(result.skipped).toHaveLength(0);
			});

			test("should include all files in the included list", () => {
				// Given
				const diff = createMultiFileDiff([{ path: "src/a.ts" }, { path: "src/b.ts" }]);
				const maxLength = 10000;

				// When
				const result = smartTruncate(diff, maxLength);

				// Then
				expect(result.included).toContain("src/a.ts");
				expect(result.included).toContain("src/b.ts");
			});
		});

		describe("when diff exceeds limit", () => {
			test("should truncate and mark wasTruncated as true", () => {
				// Given
				const diff = createMultiFileDiff([
					{ path: "src/big.ts", lineCount: 100 },
					{ path: "src/small.ts", lineCount: 5 },
				]);
				const maxLength = 500;

				// When
				const result = smartTruncate(diff, maxLength);

				// Then
				expect(result.wasTruncated).toEqual(true);
			});

			test("should always include at least one file", () => {
				// Given
				const diff = createFileDiff("src/huge.ts", 1000);
				const maxLength = 100; // Very small limit

				// When
				const result = smartTruncate(diff, maxLength);

				// Then
				expect(result.included.length).toBeGreaterThanOrEqual(1);
			});

			test("should track skipped files", () => {
				// Given
				const diff = createMultiFileDiff([
					{ path: "src/keep.ts", lineCount: 10 },
					{ path: "src/skip.ts", lineCount: 100 },
				]);
				const maxLength = 400;

				// When
				const result = smartTruncate(diff, maxLength);

				// Then
				expect(result.skipped.length).toBeGreaterThan(0);
			});

			test("should add a note about skipped files to the diff", () => {
				// Given
				const diff = createMultiFileDiff([
					{ path: "src/keep.ts", lineCount: 10 },
					{ path: "src/skip1.ts", lineCount: 100 },
					{ path: "src/skip2.ts", lineCount: 100 },
				]);
				const maxLength = 400;

				// When
				const result = smartTruncate(diff, maxLength);

				// Then
				if (result.skipped.length > 0) {
					expect(result.diff).toContain("skipped due to size");
				}
			});
		});

		describe("file prioritization", () => {
			test("should prioritize TypeScript files over JSON files", () => {
				// Given
				const diff = createMultiFileDiff([
					{ path: "package.json", lineCount: 50 },
					{ path: "src/important.ts", lineCount: 50 },
				]);
				const maxLength = 800;

				// When
				const result = smartTruncate(diff, maxLength);

				// Then
				// If truncation occurred, TS should be included before JSON
				if (result.wasTruncated && result.included.length === 1) {
					expect(result.included).toContain("src/important.ts");
				}
			});

			test("should prioritize code files over test files", () => {
				// Given
				const diff = createMultiFileDiff([
					{ path: "src/feature.spec.ts", lineCount: 50 },
					{ path: "src/feature.ts", lineCount: 50 },
				]);
				const maxLength = 800;

				// When
				const result = smartTruncate(diff, maxLength);

				// Then
				// If truncation occurred, code should be included before tests
				if (result.wasTruncated && result.included.length === 1) {
					expect(result.included).toContain("src/feature.ts");
				}
			});

			test("should give lock files lowest priority", () => {
				// Given
				const diff = createMultiFileDiff([
					{ path: "package-lock.json", lineCount: 100 },
					{ path: "src/app.ts", lineCount: 10 },
				]);
				const maxLength = 400;

				// When
				const result = smartTruncate(diff, maxLength);

				// Then
				if (result.skipped.length > 0) {
					expect(result.skipped).toContain("package-lock.json");
					expect(result.included).toContain("src/app.ts");
				}
			});
		});

		describe("edge cases", () => {
			test("should handle empty diff", () => {
				// Given
				const diff = "";
				const maxLength = 1000;

				// When
				const result = smartTruncate(diff, maxLength);

				// Then
				expect(result.diff).toEqual("");
				expect(result.included).toHaveLength(0);
				expect(result.skipped).toHaveLength(0);
				expect(result.wasTruncated).toEqual(false);
			});

			test("should handle single file diff", () => {
				// Given
				const diff = createFileDiff("src/only.ts", 5);
				const maxLength = 1000;

				// When
				const result = smartTruncate(diff, maxLength);

				// Then
				expect(result.included).toHaveLength(1);
				expect(result.included[0]).toEqual("src/only.ts");
			});

			test("should handle files with unknown extensions", () => {
				// Given
				const diff = createFileDiff("config.toml", 10);
				const maxLength = 1000;

				// When
				const result = smartTruncate(diff, maxLength);

				// Then
				expect(result.included).toContain("config.toml");
			});

			test("should return unknown for malformed diff header", () => {
				// Given - diff without proper b/ path format
				const malformedDiff = `diff --git malformed header
--- a/file.ts
+++ b/file.ts
@@ -1,1 +1,1 @@
+content`;
				const maxLength = 1000;

				// When
				const result = smartTruncate(malformedDiff, maxLength);

				// Then
				expect(result.included).toContain("unknown");
			});

			test("should show ellipsis when more than 5 files are skipped", () => {
				// Given - create many files where most will be skipped
				const diff = createMultiFileDiff([
					{ path: "src/keep.ts", lineCount: 5 },
					{ path: "src/skip1.ts", lineCount: 50 },
					{ path: "src/skip2.ts", lineCount: 50 },
					{ path: "src/skip3.ts", lineCount: 50 },
					{ path: "src/skip4.ts", lineCount: 50 },
					{ path: "src/skip5.ts", lineCount: 50 },
					{ path: "src/skip6.ts", lineCount: 50 },
					{ path: "src/skip7.ts", lineCount: 50 },
				]);
				const maxLength = 300; // Very small to ensure many files are skipped

				// When
				const result = smartTruncate(diff, maxLength);

				// Then
				if (result.skipped.length > 5) {
					expect(result.diff).toContain("...");
				}
			});
		});
	});

	describe("splitIntoBatches", () => {
		describe("when diff fits in single batch", () => {
			test("should return a single batch", () => {
				// Given
				const diff = createFileDiff("src/small.ts", 5);
				const maxLength = 10000;

				// When
				const batches = splitIntoBatches(diff, maxLength);

				// Then
				expect(batches).toHaveLength(1);
			});

			test("should set correct batch numbers", () => {
				// Given
				const diff = createFileDiff("src/small.ts", 5);
				const maxLength = 10000;

				// When
				const batches = splitIntoBatches(diff, maxLength);

				// Then
				expect(batches[0].batchNumber).toEqual(1);
				expect(batches[0].totalBatches).toEqual(1);
			});
		});

		describe("when diff requires multiple batches", () => {
			test("should create multiple batches", () => {
				// Given
				const diff = createMultiFileDiff([
					{ path: "src/file1.ts", lineCount: 50 },
					{ path: "src/file2.ts", lineCount: 50 },
					{ path: "src/file3.ts", lineCount: 50 },
				]);
				const maxLength = 800;

				// When
				const batches = splitIntoBatches(diff, maxLength);

				// Then
				expect(batches.length).toBeGreaterThan(1);
			});

			test("should set totalBatches correctly on all batches", () => {
				// Given
				const diff = createMultiFileDiff([
					{ path: "src/file1.ts", lineCount: 50 },
					{ path: "src/file2.ts", lineCount: 50 },
					{ path: "src/file3.ts", lineCount: 50 },
				]);
				const maxLength = 800;

				// When
				const batches = splitIntoBatches(diff, maxLength);

				// Then
				const totalBatches = batches.length;

				batches.forEach((batch) => {
					expect(batch.totalBatches).toEqual(totalBatches);
				});
			});

			test("should have sequential batch numbers", () => {
				// Given
				const diff = createMultiFileDiff([
					{ path: "src/file1.ts", lineCount: 50 },
					{ path: "src/file2.ts", lineCount: 50 },
					{ path: "src/file3.ts", lineCount: 50 },
				]);
				const maxLength = 800;

				// When
				const batches = splitIntoBatches(diff, maxLength);

				// Then
				batches.forEach((batch, index) => {
					expect(batch.batchNumber).toEqual(index + 1);
				});
			});

			test("should include all files across all batches", () => {
				// Given
				const files = ["src/file1.ts", "src/file2.ts", "src/file3.ts"];
				const diff = createMultiFileDiff(files.map((path) => ({ path, lineCount: 50 })));
				const maxLength = 800;

				// When
				const batches = splitIntoBatches(diff, maxLength);

				// Then
				const allFiles = batches.flatMap((batch) => batch.files);

				files.forEach((file) => {
					expect(allFiles).toContain(file);
				});
			});
		});

		describe("oversized single files", () => {
			test("should put oversized files in their own batch", () => {
				// Given
				const diff = createMultiFileDiff([
					{ path: "src/small.ts", lineCount: 5 },
					{ path: "src/huge.ts", lineCount: 500 },
				]);
				const maxLength = 500;

				// When
				const batches = splitIntoBatches(diff, maxLength);

				// Then
				const hugeBatch = batches.find((batch) => batch.files.includes("src/huge.ts"));

				expect(hugeBatch).toBeDefined();
				expect(hugeBatch?.files).toHaveLength(1);
			});

			test("should truncate oversized files and add a note", () => {
				// Given
				const diff = createFileDiff("src/huge.ts", 1000);
				const maxLength = 500;

				// When
				const batches = splitIntoBatches(diff, maxLength);

				// Then
				expect(batches[0].diff).toContain("truncated");
				expect(batches[0].diff).toContain("exceeds");
			});
		});

		describe("file prioritization in batches", () => {
			test("should prioritize TypeScript files in earlier batches", () => {
				// Given
				const diff = createMultiFileDiff([
					{ path: "package.json", lineCount: 30 },
					{ path: "src/code.ts", lineCount: 30 },
				]);
				const maxLength = 600;

				// When
				const batches = splitIntoBatches(diff, maxLength);

				// Then
				// First batch should contain TypeScript
				if (batches.length > 1) {
					expect(batches[0].files).toContain("src/code.ts");
				}
			});
		});

		describe("edge cases", () => {
			test("should handle empty diff", () => {
				// Given
				const diff = "";
				const maxLength = 1000;

				// When
				const batches = splitIntoBatches(diff, maxLength);

				// Then
				expect(batches).toHaveLength(0);
			});

			test("should include diff content in each batch", () => {
				// Given
				const diff = createFileDiff("src/test.ts", 10);
				const maxLength = 10000;

				// When
				const batches = splitIntoBatches(diff, maxLength);

				// Then
				expect(batches[0].diff).toContain("diff --git");
				expect(batches[0].diff).toContain("src/test.ts");
			});
		});
	});
});
