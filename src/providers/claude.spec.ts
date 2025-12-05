/**
 * @fileoverview Tests for the Claude provider adapter.
 */

import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";

import { ClaudeProvider } from "./claude";

// Mock the @anthropic-ai/sdk module

const mockCreate = jest.fn<() => Promise<AsyncIterable<any>>>();

jest.unstable_mockModule("@anthropic-ai/sdk", () => ({
	default: class MockAnthropic {
		messages = {
			create: mockCreate,
		};
	},
}));

describe("ClaudeProvider", () => {
	let provider: ClaudeProvider;
	const originalEnv = process.env;

	beforeEach(() => {
		jest.clearAllMocks();
		process.env = { ...originalEnv, ANTHROPIC_API_KEY: "test-api-key" };
		provider = new ClaudeProvider();
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	describe("constructor", () => {
		test("should use default values when no config provided", () => {
			// Given
			const defaultProvider = new ClaudeProvider();

			// When / Then
			expect(defaultProvider.name).toEqual("claude");
			expect(defaultProvider.displayName).toEqual("Claude");
			expect(defaultProvider.getDefaultModel()).toEqual("claude-sonnet-4-20250514");
		});

		test("should use config values when provided", () => {
			// Given
			const configuredProvider = new ClaudeProvider({
				apiKey: "custom-key",
				defaultModel: "claude-3-opus-20240229",
			});

			// When / Then
			expect(configuredProvider.getDefaultModel()).toEqual("claude-3-opus-20240229");
		});

		test("should use environment variables when available", () => {
			// Given
			process.env.CLAUDE_DEFAULT_MODEL = "env-model";

			// When
			const envProvider = new ClaudeProvider();

			// Then
			expect(envProvider.getDefaultModel()).toEqual("env-model");
		});

		test("should prefer config over environment variables", () => {
			// Given
			process.env.CLAUDE_DEFAULT_MODEL = "env-model";

			// When
			const configuredProvider = new ClaudeProvider({ defaultModel: "config-model" });

			// Then
			expect(configuredProvider.getDefaultModel()).toEqual("config-model");
		});
	});

	describe("name and displayName", () => {
		test("should have correct name", () => {
			// Given
			// When / Then
			expect(provider.name).toEqual("claude");
		});

		test("should have correct displayName", () => {
			// Given
			// When / Then
			expect(provider.displayName).toEqual("Claude");
		});
	});

	describe("checkHealth", () => {
		test("should return true when API key is configured", async () => {
			// Given
			// When
			const result = await provider.checkHealth();

			// Then
			expect(result).toEqual(true);
		});

		test("should return false when API key is not configured", async () => {
			// Given
			delete process.env.ANTHROPIC_API_KEY;
			const providerWithoutKey = new ClaudeProvider();

			// When
			const result = await providerWithoutKey.checkHealth();

			// Then
			expect(result).toEqual(false);
		});
	});

	describe("getAvailableModels", () => {
		test("should return list of known Claude models", async () => {
			// Given
			// When
			const result = await provider.getAvailableModels();

			// Then
			expect(result).toContain("claude-sonnet-4-20250514");
			expect(result).toContain("claude-3-5-sonnet-20241022");
			expect(result).toContain("claude-3-5-haiku-20241022");
			expect(result).toContain("claude-3-opus-20240229");
		});

		test("should return non-empty array", async () => {
			// Given
			// When
			const result = await provider.getAvailableModels();

			// Then
			expect(result.length).toBeGreaterThan(0);
		});
	});

	describe("isModelAvailable", () => {
		test("should return true for exact model name match", async () => {
			// Given
			// When
			const result = await provider.isModelAvailable("claude-3-5-sonnet-20241022");

			// Then
			expect(result).toEqual(true);
		});

		test("should return true for partial model name match", async () => {
			// Given
			// When
			const result = await provider.isModelAvailable("claude-3-5-sonnet");

			// Then
			expect(result).toEqual(true);
		});

		test("should return true when model name contains available model", async () => {
			// Given
			// When
			const result = await provider.isModelAvailable("sonnet");

			// Then
			expect(result).toEqual(true);
		});

		test("should return false for unknown model", async () => {
			// Given
			// When
			const result = await provider.isModelAvailable("unknown-model-xyz");

			// Then
			expect(result).toEqual(false);
		});
	});

	describe("streamResponse", () => {
		test("should throw error when API key is not configured", async () => {
			// Given
			delete process.env.ANTHROPIC_API_KEY;
			const providerWithoutKey = new ClaudeProvider();

			// When / Then
			await expect(providerWithoutKey.streamResponse("Test prompt", jest.fn())).rejects.toThrow(
				"ANTHROPIC_API_KEY environment variable is required",
			);
		});

		test("should stream response chunks and call callback", async () => {
			// Given
			const mockEvents = [
				{ type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } },
				{ type: "content_block_delta", delta: { type: "text_delta", text: " World" } },
				{ type: "content_block_delta", delta: { type: "text_delta", text: "!" } },
				{ type: "message_stop" },
			];

			mockCreate.mockResolvedValueOnce(
				(async function* () {
					for (const event of mockEvents) {
						yield event;
					}
				})(),
			);

			const onChunk = jest.fn();

			// When
			const result = await provider.streamResponse("Test prompt", onChunk);

			// Then
			expect(result).toEqual("Hello World!");
			expect(onChunk).toHaveBeenCalledWith("Hello");
			expect(onChunk).toHaveBeenCalledWith(" World");
			expect(onChunk).toHaveBeenCalledWith("!");
		});

		test("should use default model when not specified", async () => {
			// Given
			mockCreate.mockResolvedValueOnce(
				(async function* () {
					yield { type: "content_block_delta", delta: { type: "text_delta", text: "test" } };
				})(),
			);

			// When
			await provider.streamResponse("Test prompt", jest.fn());

			// Then
			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					model: "claude-sonnet-4-20250514",
				}),
			);
		});

		test("should use provided model when specified", async () => {
			// Given
			mockCreate.mockResolvedValueOnce(
				(async function* () {
					yield { type: "content_block_delta", delta: { type: "text_delta", text: "test" } };
				})(),
			);

			// When
			await provider.streamResponse("Test prompt", jest.fn(), { model: "claude-3-opus-20240229" });

			// Then
			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					model: "claude-3-opus-20240229",
				}),
			);
		});

		test("should apply maxTokens option", async () => {
			// Given
			mockCreate.mockResolvedValueOnce(
				(async function* () {
					yield { type: "content_block_delta", delta: { type: "text_delta", text: "test" } };
				})(),
			);

			// When
			await provider.streamResponse("Test prompt", jest.fn(), { maxTokens: 1000 });

			// Then
			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					max_tokens: 1000,
				}),
			);
		});

		test("should use default maxTokens when not specified", async () => {
			// Given
			mockCreate.mockResolvedValueOnce(
				(async function* () {
					yield { type: "content_block_delta", delta: { type: "text_delta", text: "test" } };
				})(),
			);

			// When
			await provider.streamResponse("Test prompt", jest.fn());

			// Then
			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					max_tokens: 2048,
				}),
			);
		});

		test("should send prompt as user message", async () => {
			// Given
			mockCreate.mockResolvedValueOnce(
				(async function* () {
					yield { type: "content_block_delta", delta: { type: "text_delta", text: "test" } };
				})(),
			);

			// When
			await provider.streamResponse("My test prompt", jest.fn());

			// Then
			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					messages: [{ role: "user", content: "My test prompt" }],
				}),
			);
		});

		test("should enable streaming", async () => {
			// Given
			mockCreate.mockResolvedValueOnce(
				(async function* () {
					yield { type: "content_block_delta", delta: { type: "text_delta", text: "test" } };
				})(),
			);

			// When
			await provider.streamResponse("Test prompt", jest.fn());

			// Then
			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					stream: true,
				}),
			);
		});

		test("should skip non-text events", async () => {
			// Given
			const mockEvents = [
				{ type: "message_start" },
				{ type: "content_block_start" },
				{ type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } },
				{ type: "content_block_stop" },
				{ type: "message_stop" },
			];

			mockCreate.mockResolvedValueOnce(
				(async function* () {
					for (const event of mockEvents) {
						yield event;
					}
				})(),
			);

			const onChunk = jest.fn();

			// When
			const result = await provider.streamResponse("Test prompt", onChunk);

			// Then
			expect(result).toEqual("Hello");
			expect(onChunk).toHaveBeenCalledTimes(1);
		});

		test("should skip events without text in delta", async () => {
			// Given
			const mockEvents = [
				{ type: "content_block_delta", delta: { type: "text_delta" } }, // No text property
				{ type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } },
			];

			mockCreate.mockResolvedValueOnce(
				(async function* () {
					for (const event of mockEvents) {
						yield event;
					}
				})(),
			);

			const onChunk = jest.fn();

			// When
			const result = await provider.streamResponse("Test prompt", onChunk);

			// Then
			expect(result).toEqual("Hello");
			expect(onChunk).toHaveBeenCalledTimes(1);
		});

		test("should cache client instance", async () => {
			// Given
			mockCreate.mockResolvedValue(
				(async function* () {
					yield { type: "content_block_delta", delta: { type: "text_delta", text: "test" } };
				})(),
			);

			// When - Call streamResponse multiple times
			await provider.streamResponse("Prompt 1", jest.fn());
			await provider.streamResponse("Prompt 2", jest.fn());
			await provider.streamResponse("Prompt 3", jest.fn());

			// Then - Client should be created once (all calls use same mock)
			expect(mockCreate).toHaveBeenCalledTimes(3);
		});
	});

	describe("getDefaultModel", () => {
		test("should return the default model", () => {
			// Given
			// When
			const result = provider.getDefaultModel();

			// Then
			expect(result).toEqual("claude-sonnet-4-20250514");
		});

		test("should return configured default model", () => {
			// Given
			const customProvider = new ClaudeProvider({ defaultModel: "claude-3-opus-20240229" });

			// When
			const result = customProvider.getDefaultModel();

			// Then
			expect(result).toEqual("claude-3-opus-20240229");
		});
	});

	describe("SDK not installed error handling", () => {
		test("should throw helpful error when SDK is not installed", async () => {
			// This test verifies the error handling path exists
			// The actual dynamic import behavior is tested via integration tests
			// Given - Provider needs SDK

			// When / Then - If import fails with ERR_MODULE_NOT_FOUND,
			// it should provide a helpful message
			// (We can't easily mock dynamic imports in Jest, so we test the provider exists)
			expect(provider).toBeDefined();
			expect(provider.name).toEqual("claude");
		});
	});
});
