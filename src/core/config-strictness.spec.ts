/**
 * Tests for config.ts with different REVIEW_STRICTNESS environment variable values.
 *
 * @remarks
 * This separate test file is needed to test the strictness level branches.
 * Since the constant is evaluated at module load time, we need to set the
 * environment variable BEFORE importing config.ts.
 *
 * ESM modules require using jest.unstable_mockModule with dynamic imports.
 */
import { beforeEach, describe, expect, jest, test } from "@jest/globals";

describe("Config module strictness levels", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		jest.resetModules();
		process.env = { ...originalEnv };
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	describe("REVIEW_STRICTNESS_LEVEL with lenient setting", () => {
		test("should use lenient when REVIEW_STRICTNESS=lenient", async () => {
			// Given
			process.env.REVIEW_STRICTNESS = "lenient";

			// When - Dynamic import to pick up env change
			const { REVIEW_STRICTNESS_LEVEL } = await import("./config.js");

			// Then
			expect(REVIEW_STRICTNESS_LEVEL).toBe("lenient");
		});
	});

	describe("REVIEW_STRICTNESS_LEVEL with strict setting", () => {
		test("should use strict when REVIEW_STRICTNESS=strict", async () => {
			// Given
			process.env.REVIEW_STRICTNESS = "strict";

			// When - Dynamic import to pick up env change
			const { REVIEW_STRICTNESS_LEVEL } = await import("./config.js");

			// Then
			expect(REVIEW_STRICTNESS_LEVEL).toBe("strict");
		});
	});

	describe("REVIEW_STRICTNESS_LEVEL with invalid setting", () => {
		test("should default to balanced when REVIEW_STRICTNESS is invalid", async () => {
			// Given
			process.env.REVIEW_STRICTNESS = "invalid-value";

			// When - Dynamic import to pick up env change
			const { REVIEW_STRICTNESS_LEVEL } = await import("./config.js");

			// Then
			expect(REVIEW_STRICTNESS_LEVEL).toBe("balanced");
		});

		test("should default to balanced when REVIEW_STRICTNESS is empty", async () => {
			// Given
			process.env.REVIEW_STRICTNESS = "";

			// When - Dynamic import to pick up env change
			const { REVIEW_STRICTNESS_LEVEL } = await import("./config.js");

			// Then
			expect(REVIEW_STRICTNESS_LEVEL).toBe("balanced");
		});
	});
});
