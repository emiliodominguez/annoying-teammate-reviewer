/**
 * @fileoverview Tests for provider types.
 *
 * Since types.ts is mostly TypeScript interfaces (which don't exist at runtime),
 * these tests verify that the module exports correctly and can be used.
 */

import { describe, expect, test } from "@jest/globals";

import type { GenerateOptions, LLMProvider, LLMProviderConstructor, ProviderConfig } from "./types";

describe("Provider types module", () => {
	describe("GenerateOptions interface", () => {
		test("should allow creating valid GenerateOptions objects", () => {
			// Given
			const options: GenerateOptions = {
				model: "test-model",
				temperature: 0.7,
				maxTokens: 2048,
			};

			// When / Then
			expect(options.model).toEqual("test-model");
			expect(options.temperature).toEqual(0.7);
			expect(options.maxTokens).toEqual(2048);
		});

		test("should allow empty GenerateOptions (all properties optional)", () => {
			// Given
			const options: GenerateOptions = {};

			// When / Then
			expect(options.model).toBeUndefined();
			expect(options.temperature).toBeUndefined();
			expect(options.maxTokens).toBeUndefined();
		});

		test("should allow partial GenerateOptions", () => {
			// Given
			const options: GenerateOptions = {
				model: "llama3.2",
			};

			// When / Then
			expect(options.model).toEqual("llama3.2");
			expect(options.temperature).toBeUndefined();
		});
	});

	describe("ProviderConfig interface", () => {
		test("should allow creating valid ProviderConfig objects", () => {
			// Given
			const config: ProviderConfig = {
				apiKey: "sk-test-key",
				baseUrl: "http://localhost:11434",
				defaultModel: "llama3.2",
			};

			// When / Then
			expect(config.apiKey).toEqual("sk-test-key");
			expect(config.baseUrl).toEqual("http://localhost:11434");
			expect(config.defaultModel).toEqual("llama3.2");
		});

		test("should allow empty ProviderConfig (all properties optional)", () => {
			// Given
			const config: ProviderConfig = {};

			// When / Then
			expect(config.apiKey).toBeUndefined();
			expect(config.baseUrl).toBeUndefined();
			expect(config.defaultModel).toBeUndefined();
		});
	});

	describe("LLMProvider interface", () => {
		test("should allow implementing LLMProvider interface", () => {
			// Given - A mock implementation of LLMProvider
			const mockProvider: LLMProvider = {
				name: "mock",
				displayName: "Mock Provider",
				checkHealth: async () => true,
				getAvailableModels: async () => ["model-1", "model-2"],
				isModelAvailable: async (modelName: string) => modelName === "model-1",
				streamResponse: async (prompt: string, onChunk: (chunk: string) => void) => {
					onChunk("Hello");

					return "Hello";
				},
				getDefaultModel: () => "model-1",
			};

			// When / Then
			expect(mockProvider.name).toEqual("mock");
			expect(mockProvider.displayName).toEqual("Mock Provider");
			expect(typeof mockProvider.checkHealth).toEqual("function");
			expect(typeof mockProvider.getAvailableModels).toEqual("function");
			expect(typeof mockProvider.isModelAvailable).toEqual("function");
			expect(typeof mockProvider.streamResponse).toEqual("function");
			expect(typeof mockProvider.getDefaultModel).toEqual("function");
		});

		test("should allow calling LLMProvider methods", async () => {
			// Given
			const chunks: string[] = [];
			const mockProvider: LLMProvider = {
				name: "test",
				displayName: "Test Provider",
				checkHealth: async () => true,
				getAvailableModels: async () => ["test-model"],
				isModelAvailable: async () => true,
				streamResponse: async (_prompt, onChunk) => {
					onChunk("chunk1");
					onChunk("chunk2");

					return "chunk1chunk2";
				},
				getDefaultModel: () => "test-model",
			};

			// When
			const healthy = await mockProvider.checkHealth();
			const models = await mockProvider.getAvailableModels();
			const available = await mockProvider.isModelAvailable("test-model");
			const response = await mockProvider.streamResponse("test", (chunk) => chunks.push(chunk));
			const defaultModel = mockProvider.getDefaultModel();

			// Then
			expect(healthy).toEqual(true);
			expect(models).toEqual(["test-model"]);
			expect(available).toEqual(true);
			expect(response).toEqual("chunk1chunk2");
			expect(chunks).toEqual(["chunk1", "chunk2"]);
			expect(defaultModel).toEqual("test-model");
		});
	});

	describe("LLMProviderConstructor interface", () => {
		test("should allow creating provider classes", () => {
			// Given - A class implementing LLMProvider
			class TestProvider implements LLMProvider {
				readonly name = "test";
				readonly displayName = "Test";
				private model: string;

				constructor(config?: ProviderConfig) {
					this.model = config?.defaultModel ?? "default-model";
				}

				async checkHealth() {
					return true;
				}

				async getAvailableModels() {
					return [this.model];
				}

				async isModelAvailable() {
					return true;
				}

				async streamResponse(_prompt: string, onChunk: (chunk: string) => void) {
					onChunk("test");

					return "test";
				}

				getDefaultModel() {
					return this.model;
				}
			}

			// When - Using the class as LLMProviderConstructor
			const ProviderClass: LLMProviderConstructor = TestProvider;
			const instance = new ProviderClass({ defaultModel: "custom-model" });

			// Then
			expect(instance.name).toEqual("test");
			expect(instance.getDefaultModel()).toEqual("custom-model");
		});

		test("should allow creating provider without config", () => {
			// Given
			class SimpleProvider implements LLMProvider {
				readonly name = "simple";
				readonly displayName = "Simple";

				constructor(_config?: ProviderConfig) {
					// No-op
				}

				async checkHealth() {
					return true;
				}

				async getAvailableModels() {
					return [];
				}

				async isModelAvailable() {
					return false;
				}

				async streamResponse() {
					return "";
				}

				getDefaultModel() {
					return "default";
				}
			}

			// When
			const ProviderClass: LLMProviderConstructor = SimpleProvider;
			const instance = new ProviderClass();

			// Then
			expect(instance.name).toEqual("simple");
		});
	});
});
