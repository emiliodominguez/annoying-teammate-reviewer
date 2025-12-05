import { REVIEWER_NAME, REVIEWER_PERSONALITY_CUSTOMIZATION, TOOL_DESCRIPTION, TOOL_SHORT_NAME } from "./config";

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
});
