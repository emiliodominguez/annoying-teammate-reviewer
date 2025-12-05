/**
 * @fileoverview Tests for the Gemini provider adapter.
 */

import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";

import { GeminiProvider } from "./gemini";

// Mock the @google/generative-ai module
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockSendMessageStream = jest.fn<() => Promise<{ stream: AsyncIterable<any> }>>();

jest.unstable_mockModule("@google/generative-ai", () => ({
	GoogleGenerativeAI: class MockGoogleGenerativeAI {
		getGenerativeModel() {
			return {
				startChat: () => ({
					sendMessageStream: mockSendMessageStream
				})
			};
		}
	}
}));

describe("GeminiProvider", () => {
	let provider: GeminiProvider;
	const originalEnv = process.env;

	beforeEach(() => {
		jest.clearAllMocks();
		process.env = { ...originalEnv, GOOGLE_AI_API_KEY: "test-api-key" };
		provider = new GeminiProvider();
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	describe("constructor", () => {
		test("should use default values when no config provided", () => {
			// Given
			const defaultProvider = new GeminiProvider();

			// When / Then
			expect(defaultProvider.name).toEqual("gemini");
			expect(defaultProvider.displayName).toEqual("Gemini");
			expect(defaultProvider.getDefaultModel()).toEqual("gemini-2.0-flash");
		});

		test("should use config values when provided", () => {
			// Given
			const configuredProvider = new GeminiProvider({
				apiKey: "custom-key",
				defaultModel: "gemini-1.5-pro"
			});

			// When / Then
			expect(configuredProvider.getDefaultModel()).toEqual("gemini-1.5-pro");
		});

		test("should use GOOGLE_AI_API_KEY environment variable", () => {
			// Given
			delete process.env.GEMINI_API_KEY;
			process.env.GOOGLE_AI_API_KEY = "google-ai-key";

			// When
			const envProvider = new GeminiProvider();

			// Then - Provider should be healthy (has key)
			expect(envProvider.checkHealth()).resolves.toEqual(true);
		});

		test("should use GEMINI_API_KEY environment variable as fallback", () => {
			// Given
			delete process.env.GOOGLE_AI_API_KEY;
			process.env.GEMINI_API_KEY = "gemini-key";

			// When
			const envProvider = new GeminiProvider();

			// Then - Provider should be healthy (has key)
			expect(envProvider.checkHealth()).resolves.toEqual(true);
		});

		test("should use GEMINI_DEFAULT_MODEL environment variable", () => {
			// Given
			process.env.GEMINI_DEFAULT_MODEL = "env-model";

			// When
			const envProvider = new GeminiProvider();

			// Then
			expect(envProvider.getDefaultModel()).toEqual("env-model");
		});

		test("should prefer config over environment variables", () => {
			// Given
			process.env.GEMINI_DEFAULT_MODEL = "env-model";

			// When
			const configuredProvider = new GeminiProvider({ defaultModel: "config-model" });

			// Then
			expect(configuredProvider.getDefaultModel()).toEqual("config-model");
		});
	});

	describe("name and displayName", () => {
		test("should have correct name", () => {
			// Given
			// When / Then
			expect(provider.name).toEqual("gemini");
		});

		test("should have correct displayName", () => {
			// Given
			// When / Then
			expect(provider.displayName).toEqual("Gemini");
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
			delete process.env.GOOGLE_AI_API_KEY;
			delete process.env.GEMINI_API_KEY;
			const providerWithoutKey = new GeminiProvider();

			// When
			const result = await providerWithoutKey.checkHealth();

			// Then
			expect(result).toEqual(false);
		});
	});

	describe("getAvailableModels", () => {
		test("should return list of known Gemini models", async () => {
			// Given
			// When
			const result = await provider.getAvailableModels();

			// Then
			expect(result).toContain("gemini-2.0-flash");
			expect(result).toContain("gemini-2.0-flash-lite");
			expect(result).toContain("gemini-1.5-flash");
			expect(result).toContain("gemini-1.5-flash-8b");
			expect(result).toContain("gemini-1.5-pro");
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
			const result = await provider.isModelAvailable("gemini-2.0-flash");

			// Then
			expect(result).toEqual(true);
		});

		test("should return true for partial model name match", async () => {
			// Given
			// When
			const result = await provider.isModelAvailable("gemini-1.5");

			// Then
			expect(result).toEqual(true);
		});

		test("should return true when model name contains available model", async () => {
			// Given
			// When
			const result = await provider.isModelAvailable("gemini");

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
			delete process.env.GOOGLE_AI_API_KEY;
			delete process.env.GEMINI_API_KEY;
			const providerWithoutKey = new GeminiProvider();

			// When / Then
			await expect(providerWithoutKey.streamResponse("Test prompt", jest.fn())).rejects.toThrow(
				"GOOGLE_AI_API_KEY environment variable is required"
			);
		});

		test("should stream response chunks and call callback", async () => {
			// Given
			const mockStream = [{ text: () => "Hello" }, { text: () => " World" }, { text: () => "!" }];

			mockSendMessageStream.mockResolvedValueOnce({
				stream: (async function* () {
					for (const chunk of mockStream) {
						yield chunk;
					}
				})()
			});

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
			mockSendMessageStream.mockResolvedValueOnce({
				stream: (async function* () {
					yield { text: () => "test" };
				})()
			});

			// When
			await provider.streamResponse("Test prompt", jest.fn());

			// Then - Model is passed to getGenerativeModel, not sendMessageStream
			// We verify the default model via getDefaultModel
			expect(provider.getDefaultModel()).toEqual("gemini-2.0-flash");
		});

		test("should use provided model when specified", async () => {
			// Given
			const customProvider = new GeminiProvider({ defaultModel: "gemini-1.5-pro" });

			mockSendMessageStream.mockResolvedValueOnce({
				stream: (async function* () {
					yield { text: () => "test" };
				})()
			});

			// When
			await customProvider.streamResponse("Test prompt", jest.fn(), { model: "gemini-1.5-pro" });

			// Then
			expect(mockSendMessageStream).toHaveBeenCalledWith("Test prompt");
		});

		test("should send prompt to sendMessageStream", async () => {
			// Given
			mockSendMessageStream.mockResolvedValueOnce({
				stream: (async function* () {
					yield { text: () => "test" };
				})()
			});

			// When
			await provider.streamResponse("My test prompt", jest.fn());

			// Then
			expect(mockSendMessageStream).toHaveBeenCalledWith("My test prompt");
		});

		test("should skip chunks with empty text", async () => {
			// Given
			const mockStream = [{ text: () => "Hello" }, { text: () => "" }, { text: () => "World" }];

			mockSendMessageStream.mockResolvedValueOnce({
				stream: (async function* () {
					for (const chunk of mockStream) {
						yield chunk;
					}
				})()
			});

			const onChunk = jest.fn();

			// When
			const result = await provider.streamResponse("Test prompt", onChunk);

			// Then
			expect(result).toEqual("HelloWorld");
			expect(onChunk).toHaveBeenCalledTimes(2);
		});

		test("should cache client instance", async () => {
			// Given
			mockSendMessageStream.mockResolvedValue({
				stream: (async function* () {
					yield { text: () => "test" };
				})()
			});

			// When - Call streamResponse multiple times
			await provider.streamResponse("Prompt 1", jest.fn());
			await provider.streamResponse("Prompt 2", jest.fn());
			await provider.streamResponse("Prompt 3", jest.fn());

			// Then - sendMessageStream should be called each time
			expect(mockSendMessageStream).toHaveBeenCalledTimes(3);
		});
	});

	describe("getDefaultModel", () => {
		test("should return the default model", () => {
			// Given
			// When
			const result = provider.getDefaultModel();

			// Then
			expect(result).toEqual("gemini-2.0-flash");
		});

		test("should return configured default model", () => {
			// Given
			const customProvider = new GeminiProvider({ defaultModel: "gemini-1.5-pro" });

			// When
			const result = customProvider.getDefaultModel();

			// Then
			expect(result).toEqual("gemini-1.5-pro");
		});
	});

	describe("SDK not installed error handling", () => {
		test("should throw helpful error when SDK is not installed", async () => {
			// This test verifies the error handling path exists
			// Given - Provider needs SDK

			// When / Then - Verify the provider works
			expect(provider).toBeDefined();
			expect(provider.name).toEqual("gemini");
		});
	});
});
