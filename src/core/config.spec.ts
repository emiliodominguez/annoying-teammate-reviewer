import {
	REVIEWER_NAME,
	REVIEWER_PERSONALITY_CUSTOMIZATION,
	REVIEW_STRICTNESS_LEVEL,
	STRICTNESS_DESCRIPTIONS,
	TOOL_DESCRIPTION,
	TOOL_SHORT_NAME,
} from "./config";

describe("Config module", () => {
	describe("REVIEWER_NAME", () => {
		test("should be a non-empty string", () => {
			// Given
			// When
			// Then
			expect(typeof REVIEWER_NAME).toEqual("string");
			expect(REVIEWER_NAME.length).toBeGreaterThan(0);
		});
	});

	describe("TOOL_SHORT_NAME", () => {
		test("should be a non-empty string", () => {
			// Given
			// When
			// Then
			expect(typeof TOOL_SHORT_NAME).toEqual("string");
			expect(TOOL_SHORT_NAME.length).toBeGreaterThan(0);
		});

		test("should be a valid CLI name (lowercase, no spaces)", () => {
			// Given
			// When
			// Then
			expect(TOOL_SHORT_NAME).toMatch(/^[a-z0-9-]+$/);
		});
	});

	describe("TOOL_DESCRIPTION", () => {
		test("should be a non-empty string", () => {
			// Given
			// When
			// Then
			expect(typeof TOOL_DESCRIPTION).toEqual("string");
			expect(TOOL_DESCRIPTION.length).toBeGreaterThan(0);
		});

		test("should include the reviewer name", () => {
			// Given
			// When
			// Then
			expect(TOOL_DESCRIPTION).toContain(REVIEWER_NAME);
		});

		test("should describe it as an AI code reviewer", () => {
			// Given
			// When
			// Then
			expect(TOOL_DESCRIPTION.toLowerCase()).toContain("ai code reviewer");
		});
	});

	describe("REVIEWER_PERSONALITY_CUSTOMIZATION", () => {
		test("should be a string (can be empty for neutral reviewer)", () => {
			// Given
			// When
			// Then
			expect(typeof REVIEWER_PERSONALITY_CUSTOMIZATION).toEqual("string");
		});

		test("should include the reviewer name when defined", () => {
			// Given
			// When
			// Then
			if (REVIEWER_PERSONALITY_CUSTOMIZATION.length > 0) {
				expect(REVIEWER_PERSONALITY_CUSTOMIZATION).toContain(REVIEWER_NAME);
			}
		});

		test("should define a review style when personality is set", () => {
			// Given
			// When
			// Then
			if (REVIEWER_PERSONALITY_CUSTOMIZATION.length > 0) {
				expect(REVIEWER_PERSONALITY_CUSTOMIZATION.toLowerCase()).toMatch(/style|review|direct|concise|thorough/);
			}
		});
	});

	describe("REVIEW_STRICTNESS_LEVEL", () => {
		test("should be a valid strictness level", () => {
			// Given
			// When
			// Then
			expect(["lenient", "balanced", "strict"]).toContain(REVIEW_STRICTNESS_LEVEL);
		});

		test("should default to balanced when env var is not set", () => {
			// Given - default environment (no REVIEW_STRICTNESS set or invalid value)
			// When - module is loaded
			// Then - should use balanced as default
			// Note: This test verifies the default; env var override is tested via integration
			expect(REVIEW_STRICTNESS_LEVEL).toBe("balanced");
		});
	});

	describe("STRICTNESS_DESCRIPTIONS", () => {
		test("should have descriptions for all strictness levels", () => {
			// Given
			// When
			// Then
			expect(STRICTNESS_DESCRIPTIONS).toHaveProperty("lenient");
			expect(STRICTNESS_DESCRIPTIONS).toHaveProperty("balanced");
			expect(STRICTNESS_DESCRIPTIONS).toHaveProperty("strict");
		});

		test("should have non-empty descriptions", () => {
			// Given
			// When
			// Then
			expect(STRICTNESS_DESCRIPTIONS.lenient.length).toBeGreaterThan(0);
			expect(STRICTNESS_DESCRIPTIONS.balanced.length).toBeGreaterThan(0);
			expect(STRICTNESS_DESCRIPTIONS.strict.length).toBeGreaterThan(0);
		});

		test("lenient description should focus on critical issues", () => {
			// Given
			// When
			// Then
			expect(STRICTNESS_DESCRIPTIONS.lenient.toLowerCase()).toMatch(/critical|bug|security/);
		});

		test("strict description should be comprehensive", () => {
			// Given
			// When
			// Then
			expect(STRICTNESS_DESCRIPTIONS.strict.toLowerCase()).toMatch(/thorough|everything/);
		});
	});
});
