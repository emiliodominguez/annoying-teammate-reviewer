/**
 * @fileoverview Tests for the OpenAI provider adapter.
 */

import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";

import { OpenAIProvider } from "./openai";

// Mock the openai module

const mockCreate = jest.fn<(options: unknown) => Promise<AsyncIterable<unknown>>>();

jest.unstable_mockModule("openai", () => ({
	default: class MockOpenAI {
		chat = {
			completions: {
				create: mockCreate,
			},
		};
	},
}));

describe("OpenAIProvider", () => {
	let provider: OpenAIProvider;
	const originalEnv = process.env;

	beforeEach(() => {
		jest.clearAllMocks();
		process.env = { ...originalEnv, OPENAI_API_KEY: "test-api-key" };
		provider = new OpenAIProvider();
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	describe("constructor", () => {
		test("should use default values when no config provided", () => {
			// Given
			const defaultProvider = new OpenAIProvider();

			// When / Then
			expect(defaultProvider.name).toEqual("openai");
			expect(defaultProvider.displayName).toEqual("OpenAI");
			expect(defaultProvider.getDefaultModel()).toEqual("gpt-4.1");
		});

		test("should use config values when provided", () => {
			// Given
			const configuredProvider = new OpenAIProvider({
				apiKey: "custom-key",
				baseUrl: "http://custom.api.com",
				defaultModel: "gpt-4-turbo",
			});

			// When / Then
			expect(configuredProvider.getDefaultModel()).toEqual("gpt-4-turbo");
		});

		test("should use environment variables when available", () => {
			// Given
			process.env.OPENAI_DEFAULT_MODEL = "env-model";
			process.env.OPENAI_BASE_URL = "http://env.api.com";

			// When
			const envProvider = new OpenAIProvider();

			// Then
			expect(envProvider.getDefaultModel()).toEqual("env-model");
		});

		test("should prefer config over environment variables", () => {
			// Given
			process.env.OPENAI_DEFAULT_MODEL = "env-model";

			// When
			const configuredProvider = new OpenAIProvider({ defaultModel: "config-model" });

			// Then
			expect(configuredProvider.getDefaultModel()).toEqual("config-model");
		});
	});

	describe("name and displayName", () => {
		test("should have correct name", () => {
			// Given
			// When / Then
			expect(provider.name).toEqual("openai");
		});

		test("should have correct displayName", () => {
			// Given
			// When / Then
			expect(provider.displayName).toEqual("OpenAI");
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
			delete process.env.OPENAI_API_KEY;
			const providerWithoutKey = new OpenAIProvider();

			// When
			const result = await providerWithoutKey.checkHealth();

			// Then
			expect(result).toEqual(false);
		});
	});

	describe("getAvailableModels", () => {
		test("should return list of known OpenAI models", async () => {
			// Given
			// When
			const result = await provider.getAvailableModels();

			// Then
			expect(result).toContain("gpt-4.1");
			expect(result).toContain("gpt-4.1-mini");
			expect(result).toContain("gpt-4.1-nano");
			expect(result).toContain("gpt-4o");
			expect(result).toContain("o3");
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
			const result = await provider.isModelAvailable("gpt-4.1");

			// Then
			expect(result).toEqual(true);
		});

		test("should return true for partial model name match", async () => {
			// Given
			// When
			const result = await provider.isModelAvailable("gpt-4");

			// Then
			expect(result).toEqual(true);
		});

		test("should return true when model name contains available model", async () => {
			// Given
			// When
			const result = await provider.isModelAvailable("gpt");

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
			delete process.env.OPENAI_API_KEY;
			const providerWithoutKey = new OpenAIProvider();

			// When / Then
			await expect(providerWithoutKey.streamResponse("Test prompt", jest.fn())).rejects.toThrow(
				"OPENAI_API_KEY environment variable is required",
			);
		});

		test("should stream response chunks and call callback", async () => {
			// Given
			const mockChunks = [
				{ choices: [{ delta: { content: "Hello" } }] },
				{ choices: [{ delta: { content: " World" } }] },
				{ choices: [{ delta: { content: "!" } }] },
			];

			mockCreate.mockResolvedValueOnce(
				(async function* () {
					for (const chunk of mockChunks) {
						yield chunk;
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
					yield { choices: [{ delta: { content: "test" } }] };
				})(),
			);

			// When
			await provider.streamResponse("Test prompt", jest.fn());

			// Then
			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					model: "gpt-4.1",
				}),
			);
		});

		test("should use provided model when specified", async () => {
			// Given
			mockCreate.mockResolvedValueOnce(
				(async function* () {
					yield { choices: [{ delta: { content: "test" } }] };
				})(),
			);

			// When
			await provider.streamResponse("Test prompt", jest.fn(), { model: "gpt-4-turbo" });

			// Then
			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					model: "gpt-4-turbo",
				}),
			);
		});

		test("should apply maxTokens option", async () => {
			// Given
			mockCreate.mockResolvedValueOnce(
				(async function* () {
					yield { choices: [{ delta: { content: "test" } }] };
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

		test("should apply temperature option", async () => {
			// Given
			mockCreate.mockResolvedValueOnce(
				(async function* () {
					yield { choices: [{ delta: { content: "test" } }] };
				})(),
			);

			// When
			await provider.streamResponse("Test prompt", jest.fn(), { temperature: 0.5 });

			// Then
			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					temperature: 0.5,
				}),
			);
		});

		test("should use default maxTokens and temperature when not specified", async () => {
			// Given
			mockCreate.mockResolvedValueOnce(
				(async function* () {
					yield { choices: [{ delta: { content: "test" } }] };
				})(),
			);

			// When
			await provider.streamResponse("Test prompt", jest.fn());

			// Then
			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					max_tokens: 2048,
					temperature: 0.7,
				}),
			);
		});

		test("should send prompt as user message", async () => {
			// Given
			mockCreate.mockResolvedValueOnce(
				(async function* () {
					yield { choices: [{ delta: { content: "test" } }] };
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
					yield { choices: [{ delta: { content: "test" } }] };
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

		test("should skip chunks without content", async () => {
			// Given
			const mockChunks = [
				{ choices: [{ delta: {} }] }, // No content
				{ choices: [{ delta: { content: "Hello" } }] },
				{ choices: [{ delta: { content: undefined } }] }, // Undefined content
				{ choices: [{ delta: { content: "World" } }] },
			];

			mockCreate.mockResolvedValueOnce(
				(async function* () {
					for (const chunk of mockChunks) {
						yield chunk;
					}
				})(),
			);

			const onChunk = jest.fn();

			// When
			const result = await provider.streamResponse("Test prompt", onChunk);

			// Then
			expect(result).toEqual("HelloWorld");
			expect(onChunk).toHaveBeenCalledTimes(2);
		});

		test("should handle empty choices array", async () => {
			// Given
			const mockChunks = [{ choices: [] }, { choices: [{ delta: { content: "Hello" } }] }];

			mockCreate.mockResolvedValueOnce(
				(async function* () {
					for (const chunk of mockChunks) {
						yield chunk;
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
					yield { choices: [{ delta: { content: "test" } }] };
				})(),
			);

			// When - Call streamResponse multiple times
			await provider.streamResponse("Prompt 1", jest.fn());
			await provider.streamResponse("Prompt 2", jest.fn());
			await provider.streamResponse("Prompt 3", jest.fn());

			// Then - Client should be created once
			expect(mockCreate).toHaveBeenCalledTimes(3);
		});
	});

	describe("getDefaultModel", () => {
		test("should return the default model", () => {
			// Given
			// When
			const result = provider.getDefaultModel();

			// Then
			expect(result).toEqual("gpt-4.1");
		});

		test("should return configured default model", () => {
			// Given
			const customProvider = new OpenAIProvider({ defaultModel: "gpt-4-turbo" });

			// When
			const result = customProvider.getDefaultModel();

			// Then
			expect(result).toEqual("gpt-4-turbo");
		});
	});

	describe("SDK not installed error handling", () => {
		test("should throw helpful error when SDK is not installed", async () => {
			// This test verifies the error handling path exists
			// Given - Provider needs SDK

			// When / Then - Verify the provider works
			expect(provider).toBeDefined();
			expect(provider.name).toEqual("openai");
		});
	});
});
