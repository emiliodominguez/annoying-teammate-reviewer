/**
 * Tests for prompts.ts with empty REVIEWER_PERSONALITY_CUSTOMIZATION.
 *
 * @remarks
 * This separate test file is needed to test the branch at line 232 where
 * REVIEWER_PERSONALITY_CUSTOMIZATION is empty/falsy. Since the constant is
 * evaluated at module load time, we need to mock the config module BEFORE
 * importing prompts.ts.
 *
 * ESM modules require using jest.unstable_mockModule with dynamic imports.
 * The mock MUST be registered at the top level before any imports.
 */
import { beforeEach, describe, expect, jest, test } from "@jest/globals";

// Mock the config module with empty personality BEFORE importing prompts
jest.unstable_mockModule("./config.js", () => ({
	REVIEWER_NAME: "TestReviewer",
	TOOL_SHORT_NAME: "test-reviewer",
	TOOL_DESCRIPTION: "Test description",
	REVIEWER_PERSONALITY_CUSTOMIZATION: "" // Empty string to test the falsy branch
}));

// Dynamic import after mock setup (required for ESM)
const { REVIEWER_PERSONALITY } = await import("./prompts.js");

describe("Prompts module with empty personality customization", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("REVIEWER_PERSONALITY with empty customization", () => {
		test("should not include personality section when customization is empty", () => {
			// Given - REVIEWER_PERSONALITY_CUSTOMIZATION is empty (mocked above)

			// When - REVIEWER_PERSONALITY is evaluated at import time

			// Then
			expect(REVIEWER_PERSONALITY).not.toContain("## Your Personality");
		});

		test("should still contain the base reviewer role", () => {
			// Given
			// When
			// Then
			expect(REVIEWER_PERSONALITY).toContain("You are a code reviewer");
		});

		test("should still include reviewer instructions", () => {
			// Given
			// When
			// Then
			expect(REVIEWER_PERSONALITY).toContain("CRITICAL RULES");
			expect(REVIEWER_PERSONALITY).toContain("NEVER invent");
			expect(REVIEWER_PERSONALITY).toContain("RESPONSE FORMAT");
		});

		test("should still include verdict options", () => {
			// Given
			// When
			// Then
			expect(REVIEWER_PERSONALITY).toContain("Would approve");
			expect(REVIEWER_PERSONALITY).toContain("Would request changes");
			expect(REVIEWER_PERSONALITY).toContain("Would block");
		});
	});
});
