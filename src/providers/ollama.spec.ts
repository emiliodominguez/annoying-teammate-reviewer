/**
 * @fileoverview Tests for the Ollama provider adapter.
 */

import { beforeEach, describe, expect, jest, test } from "@jest/globals";

import { OllamaProvider } from "./ollama";

// Mock global fetch
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;

global.fetch = mockFetch;

describe("OllamaProvider", () => {
	let provider: OllamaProvider;

	beforeEach(() => {
		jest.clearAllMocks();
		provider = new OllamaProvider();
	});

	describe("constructor", () => {
		test("should use default values when no config provided", () => {
			// Given
			const defaultProvider = new OllamaProvider();

			// When / Then
			expect(defaultProvider.name).toEqual("ollama");
			expect(defaultProvider.displayName).toEqual("Ollama");
			expect(defaultProvider.getDefaultModel()).toEqual("codellama");
		});

		test("should use config values when provided", () => {
			// Given
			const configuredProvider = new OllamaProvider({
				baseUrl: "http://custom:8080",
				defaultModel: "llama3.2"
			});

			// When / Then
			expect(configuredProvider.getDefaultModel()).toEqual("llama3.2");
		});

		test("should use environment variables when available", () => {
			// Given
			const originalEnv = process.env;

			process.env = {
				...originalEnv,
				OLLAMA_BASE_URL: "http://env-host:1234",
				OLLAMA_DEFAULT_MODEL: "env-model"
			};

			// When
			const envProvider = new OllamaProvider();

			// Then
			expect(envProvider.getDefaultModel()).toEqual("env-model");

			// Cleanup
			process.env = originalEnv;
		});

		test("should prefer config over environment variables", () => {
			// Given
			const originalEnv = process.env;

			process.env = {
				...originalEnv,
				OLLAMA_DEFAULT_MODEL: "env-model"
			};

			// When
			const configuredProvider = new OllamaProvider({ defaultModel: "config-model" });

			// Then
			expect(configuredProvider.getDefaultModel()).toEqual("config-model");

			// Cleanup
			process.env = originalEnv;
		});
	});

	describe("name and displayName", () => {
		test("should have correct name", () => {
			// Given
			// When / Then
			expect(provider.name).toEqual("ollama");
		});

		test("should have correct displayName", () => {
			// Given
			// When / Then
			expect(provider.displayName).toEqual("Ollama");
		});
	});

	describe("checkHealth", () => {
		test("should return true when Ollama is running", async () => {
			// Given
			mockFetch.mockResolvedValueOnce({ ok: true } as Response);

			// When
			const result = await provider.checkHealth();

			// Then
			expect(result).toEqual(true);
			expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("/api/tags"));
		});

		test("should return false when Ollama is not running", async () => {
			// Given
			mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

			// When
			const result = await provider.checkHealth();

			// Then
			expect(result).toEqual(false);
		});

		test("should return false when response is not ok", async () => {
			// Given
			mockFetch.mockResolvedValueOnce({ ok: false } as Response);

			// When
			const result = await provider.checkHealth();

			// Then
			expect(result).toEqual(false);
		});

		test("should use custom base URL when configured", async () => {
			// Given
			const customProvider = new OllamaProvider({ baseUrl: "http://custom:9999" });

			mockFetch.mockResolvedValueOnce({ ok: true } as Response);

			// When
			await customProvider.checkHealth();

			// Then
			expect(mockFetch).toHaveBeenCalledWith("http://custom:9999/api/tags");
		});
	});

	describe("getAvailableModels", () => {
		test("should return array of model names", async () => {
			// Given
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					models: [
						{ name: "llama3.2:latest", modified_at: "2024-01-01", size: 1000 },
						{ name: "codellama:7b", modified_at: "2024-01-01", size: 2000 },
						{ name: "mistral:latest", modified_at: "2024-01-01", size: 3000 }
					]
				})
			} as Response);

			// When
			const result = await provider.getAvailableModels();

			// Then
			expect(result).toEqual(["llama3.2:latest", "codellama:7b", "mistral:latest"]);
		});

		test("should return empty array when no models available", async () => {
			// Given
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ models: [] })
			} as Response);

			// When
			const result = await provider.getAvailableModels();

			// Then
			expect(result).toEqual([]);
		});

		test("should return empty array on error", async () => {
			// Given
			mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

			// When
			const result = await provider.getAvailableModels();

			// Then
			expect(result).toEqual([]);
		});

		test("should return empty array when response is not ok", async () => {
			// Given
			mockFetch.mockResolvedValueOnce({ ok: false } as Response);

			// When
			const result = await provider.getAvailableModels();

			// Then
			expect(result).toEqual([]);
		});

		test("should handle undefined models in response", async () => {
			// Given
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({})
			} as Response);

			// When
			const result = await provider.getAvailableModels();

			// Then
			expect(result).toEqual([]);
		});
	});

	describe("isModelAvailable", () => {
		test("should return true when model exists", async () => {
			// Given
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					models: [{ name: "llama3.2:latest" }, { name: "codellama:7b" }]
				})
			} as Response);

			// When
			const result = await provider.isModelAvailable("llama3.2");

			// Then
			expect(result).toEqual(true);
		});

		test("should return true when model matches with version tag", async () => {
			// Given
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					models: [{ name: "llama3.2:latest" }]
				})
			} as Response);

			// When
			const result = await provider.isModelAvailable("llama3.2");

			// Then
			expect(result).toEqual(true);
		});

		test("should return false when model does not exist", async () => {
			// Given
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					models: [{ name: "llama3.2:latest" }]
				})
			} as Response);

			// When
			const result = await provider.isModelAvailable("nonexistent-model");

			// Then
			expect(result).toEqual(false);
		});

		test("should return false when no models available", async () => {
			// Given
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ models: [] })
			} as Response);

			// When
			const result = await provider.isModelAvailable("llama3.2");

			// Then
			expect(result).toEqual(false);
		});
	});

	describe("streamResponse", () => {
		/**
		 * Creates a mock ReadableStream for testing streaming responses.
		 */
		function createMockStream(chunks: string[]): ReadableStream<Uint8Array> {
			let index = 0;
			const encoder = new TextEncoder();

			return {
				getReader: () => ({
					read: async (): Promise<{ done: boolean; value: Uint8Array | undefined }> => {
						if (index >= chunks.length) {
							return { done: true, value: undefined };
						}

						const chunk = chunks[index++];

						return { done: false, value: encoder.encode(chunk) };
					}
				})
			} as unknown as ReadableStream<Uint8Array>;
		}

		test("should stream response chunks and call callback", async () => {
			// Given
			const chunks = ['{"response":"Hello","done":false}\n', '{"response":" World","done":false}\n', '{"response":"!","done":true}\n'];
			const mockStream = createMockStream(chunks);

			mockFetch.mockResolvedValueOnce({
				ok: true,
				body: mockStream
			} as Response);

			const onChunk = jest.fn();

			// When
			const result = await provider.streamResponse("Test prompt", onChunk);

			// Then
			expect(result).toEqual("Hello World!");
			expect(onChunk).toHaveBeenCalledWith("Hello");
			expect(onChunk).toHaveBeenCalledWith(" World");
			expect(onChunk).toHaveBeenCalledWith("!");
		});

		test("should throw error when response is not ok", async () => {
			// Given
			mockFetch.mockResolvedValueOnce({
				ok: false,
				text: async () => "Model not found"
			} as Response);

			// When / Then
			await expect(provider.streamResponse("Test prompt", jest.fn())).rejects.toThrow("Ollama error: Model not found");
		});

		test("should throw error when stream is null", async () => {
			// Given
			mockFetch.mockResolvedValueOnce({
				ok: true,
				body: null
			} as Response);

			// When / Then
			await expect(provider.streamResponse("Test prompt", jest.fn())).rejects.toThrow("No response stream received from Ollama");
		});

		test("should use default model when not specified", async () => {
			// Given
			const chunks = ['{"response":"test","done":true}\n'];
			const mockStream = createMockStream(chunks);

			mockFetch.mockResolvedValueOnce({
				ok: true,
				body: mockStream
			} as Response);

			// When
			await provider.streamResponse("Test prompt", jest.fn());

			// Then
			const callBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);

			expect(callBody.model).toEqual("codellama");
		});

		test("should use provided model when specified", async () => {
			// Given
			const chunks = ['{"response":"test","done":true}\n'];
			const mockStream = createMockStream(chunks);

			mockFetch.mockResolvedValueOnce({
				ok: true,
				body: mockStream
			} as Response);

			// When
			await provider.streamResponse("Test prompt", jest.fn(), { model: "custom-model" });

			// Then
			const callBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);

			expect(callBody.model).toEqual("custom-model");
		});

		test("should apply temperature option", async () => {
			// Given
			const chunks = ['{"response":"test","done":true}\n'];
			const mockStream = createMockStream(chunks);

			mockFetch.mockResolvedValueOnce({
				ok: true,
				body: mockStream
			} as Response);

			// When
			await provider.streamResponse("Test prompt", jest.fn(), { temperature: 0.5 });

			// Then
			const callBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);

			expect(callBody.options.temperature).toEqual(0.5);
		});

		test("should apply maxTokens option as num_predict", async () => {
			// Given
			const chunks = ['{"response":"test","done":true}\n'];
			const mockStream = createMockStream(chunks);

			mockFetch.mockResolvedValueOnce({
				ok: true,
				body: mockStream
			} as Response);

			// When
			await provider.streamResponse("Test prompt", jest.fn(), { maxTokens: 1000 });

			// Then
			const callBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);

			expect(callBody.options.num_predict).toEqual(1000);
		});

		test("should use default temperature and maxTokens when not specified", async () => {
			// Given
			const chunks = ['{"response":"test","done":true}\n'];
			const mockStream = createMockStream(chunks);

			mockFetch.mockResolvedValueOnce({
				ok: true,
				body: mockStream
			} as Response);

			// When
			await provider.streamResponse("Test prompt", jest.fn());

			// Then
			const callBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);

			expect(callBody.options.temperature).toEqual(0.7);
			expect(callBody.options.num_predict).toEqual(2048);
		});

		test("should handle multiple JSON objects in single chunk", async () => {
			// Given
			const chunks = ['{"response":"A","done":false}\n{"response":"B","done":false}\n'];
			const mockStream = createMockStream(chunks);

			mockFetch.mockResolvedValueOnce({
				ok: true,
				body: mockStream
			} as Response);

			const onChunk = jest.fn();

			// When
			const result = await provider.streamResponse("Test prompt", onChunk);

			// Then
			expect(result).toEqual("AB");
			expect(onChunk).toHaveBeenCalledWith("A");
			expect(onChunk).toHaveBeenCalledWith("B");
		});

		test("should handle chunks without response field", async () => {
			// Given
			const chunks = ['{"done":false}\n', '{"response":"Hello","done":true}\n'];
			const mockStream = createMockStream(chunks);

			mockFetch.mockResolvedValueOnce({
				ok: true,
				body: mockStream
			} as Response);

			const onChunk = jest.fn();

			// When
			const result = await provider.streamResponse("Test prompt", onChunk);

			// Then
			expect(result).toEqual("Hello");
			expect(onChunk).toHaveBeenCalledTimes(1);
		});

		test("should gracefully handle malformed JSON", async () => {
			// Given - Malformed JSON that can happen at chunk boundaries
			const chunks = ['{"response":"Hello","done":false}\n', "malformed json\n", '{"response":"World","done":true}\n'];
			const mockStream = createMockStream(chunks);

			mockFetch.mockResolvedValueOnce({
				ok: true,
				body: mockStream
			} as Response);

			const onChunk = jest.fn();

			// When
			const result = await provider.streamResponse("Test prompt", onChunk);

			// Then - Should skip malformed JSON and continue
			expect(result).toEqual("HelloWorld");
		});

		test("should send stream: true in request", async () => {
			// Given
			const chunks = ['{"response":"test","done":true}\n'];
			const mockStream = createMockStream(chunks);

			mockFetch.mockResolvedValueOnce({
				ok: true,
				body: mockStream
			} as Response);

			// When
			await provider.streamResponse("Test prompt", jest.fn());

			// Then
			const callBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);

			expect(callBody.stream).toEqual(true);
		});

		test("should use custom base URL when configured", async () => {
			// Given
			const customProvider = new OllamaProvider({ baseUrl: "http://custom:9999" });
			const chunks = ['{"response":"test","done":true}\n'];
			const mockStream = createMockStream(chunks);

			mockFetch.mockResolvedValueOnce({
				ok: true,
				body: mockStream
			} as Response);

			// When
			await customProvider.streamResponse("Test prompt", jest.fn());

			// Then
			expect(mockFetch).toHaveBeenCalledWith("http://custom:9999/api/generate", expect.any(Object));
		});
	});

	describe("getDefaultModel", () => {
		test("should return the default model", () => {
			// Given
			// When
			const result = provider.getDefaultModel();

			// Then
			expect(result).toEqual("codellama");
		});

		test("should return configured default model", () => {
			// Given
			const customProvider = new OllamaProvider({ defaultModel: "mistral" });

			// When
			const result = customProvider.getDefaultModel();

			// Then
			expect(result).toEqual("mistral");
		});
	});
});
