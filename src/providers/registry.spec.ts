/**
 * @fileoverview Tests for the provider registry.
 */

import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";

import type { LLMProvider, ProviderConfig } from "./types";
import { ProviderRegistry, providerRegistry } from "./registry";

/**
 * Creates a mock LLM provider for testing.
 */
function createMockProvider(overrides: Partial<LLMProvider> = {}): LLMProvider {
	return {
		name: "mock",
		displayName: "Mock Provider",
		checkHealth: async () => true,
		getAvailableModels: async () => ["mock-model"],
		isModelAvailable: async () => true,
		streamResponse: async (_prompt, onChunk) => {
			onChunk("test");

			return "test";
		},
		getDefaultModel: () => "mock-model",
		...overrides
	};
}

/**
 * Creates a mock provider class for testing.
 */
function createMockProviderClass(name: string, healthy = true) {
	return class MockProvider implements LLMProvider {
		readonly name = name;
		readonly displayName = name.charAt(0).toUpperCase() + name.slice(1);
		private model: string;

		constructor(config?: ProviderConfig) {
			this.model = config?.defaultModel || "default-model";
		}

		async checkHealth() {
			return healthy;
		}

		async getAvailableModels() {
			return [this.model];
		}

		async isModelAvailable() {
			return true;
		}

		async streamResponse(_prompt: string, onChunk: (chunk: string) => void) {
			onChunk("response");

			return "response";
		}

		getDefaultModel() {
			return this.model;
		}
	};
}

describe("ProviderRegistry", () => {
	let registry: ProviderRegistry;

	beforeEach(() => {
		registry = new ProviderRegistry();
	});

	describe("register", () => {
		test("should register a provider instance", () => {
			// Given
			const provider = createMockProvider({ name: "test-provider" });

			// When
			registry.register(provider);

			// Then
			expect(registry.has("test-provider")).toEqual(true);
		});

		test("should normalize provider name to lowercase", () => {
			// Given
			const provider = createMockProvider({ name: "TestProvider" });

			// When
			registry.register(provider);

			// Then
			expect(registry.has("testprovider")).toEqual(true);
			expect(registry.has("TestProvider")).toEqual(true);
		});

		test("should allow overwriting an existing provider", () => {
			// Given
			const provider1 = createMockProvider({ name: "test", displayName: "First" });
			const provider2 = createMockProvider({ name: "test", displayName: "Second" });

			// When
			registry.register(provider1);
			registry.register(provider2);

			// Then
			const retrieved = registry.get("test");

			expect(retrieved?.displayName).toEqual("Second");
		});
	});

	describe("registerClass", () => {
		test("should register a provider class", () => {
			// Given
			const MockClass = createMockProviderClass("myclass");

			// When
			registry.registerClass("myclass", MockClass);

			// Then
			expect(registry.has("myclass")).toEqual(true);
		});

		test("should normalize class name to lowercase", () => {
			// Given
			const MockClass = createMockProviderClass("MyClass");

			// When
			registry.registerClass("MyClass", MockClass);

			// Then
			expect(registry.has("myclass")).toEqual(true);
		});

		test("should pass config to provider constructor", () => {
			// Given
			const MockClass = createMockProviderClass("configured");

			// When
			registry.registerClass("configured", MockClass, { defaultModel: "custom-model" });
			const provider = registry.get("configured");

			// Then
			expect(provider?.getDefaultModel()).toEqual("custom-model");
		});

		test("should lazily instantiate provider", () => {
			// Given
			let instantiated = false;

			class LazyProvider implements LLMProvider {
				readonly name = "lazy";
				readonly displayName = "Lazy";

				constructor() {
					instantiated = true;
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
					return "model";
				}
			}

			// When - register but don't get
			registry.registerClass("lazy", LazyProvider);

			// Then - not yet instantiated
			expect(instantiated).toEqual(false);

			// When - get the provider
			registry.get("lazy");

			// Then - now instantiated
			expect(instantiated).toEqual(true);
		});
	});

	describe("get", () => {
		test("should return registered provider", () => {
			// Given
			const provider = createMockProvider({ name: "getme" });

			registry.register(provider);

			// When
			const result = registry.get("getme");

			// Then
			expect(result).toEqual(provider);
		});

		test("should return undefined for unknown provider", () => {
			// Given
			// When
			const result = registry.get("unknown");

			// Then
			expect(result).toBeUndefined();
		});

		test("should be case-insensitive", () => {
			// Given
			const provider = createMockProvider({ name: "casetest" });

			registry.register(provider);

			// When / Then
			expect(registry.get("casetest")).toEqual(provider);
			expect(registry.get("CASETEST")).toEqual(provider);
			expect(registry.get("CaseTest")).toEqual(provider);
		});

		test("should cache provider instance after first get", () => {
			// Given
			let callCount = 0;

			class CountingProvider implements LLMProvider {
				readonly name = "counting";
				readonly displayName = "Counting";

				constructor() {
					callCount++;
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
					return "model";
				}
			}

			registry.registerClass("counting", CountingProvider);

			// When
			registry.get("counting");
			registry.get("counting");
			registry.get("counting");

			// Then
			expect(callCount).toEqual(1);
		});
	});

	describe("getDefault", () => {
		const originalEnv = process.env;

		beforeEach(() => {
			process.env = { ...originalEnv };
			delete process.env.LLM_PROVIDER;
		});

		afterEach(() => {
			process.env = originalEnv;
		});

		test("should throw when no providers are registered", async () => {
			// Given
			// When / Then
			await expect(registry.getDefault()).rejects.toThrow("No LLM providers registered");
		});

		test("should return provider specified by LLM_PROVIDER env var", async () => {
			// Given
			const provider1 = createMockProvider({ name: "first" });
			const provider2 = createMockProvider({ name: "second" });

			registry.register(provider1);
			registry.register(provider2);
			process.env.LLM_PROVIDER = "second";

			// When
			const result = await registry.getDefault();

			// Then
			expect(result.name).toEqual("second");
		});

		test("should warn and fall back when LLM_PROVIDER is invalid", async () => {
			// Given
			const consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => {});
			const provider = createMockProvider({ name: "fallback" });

			registry.register(provider);
			process.env.LLM_PROVIDER = "nonexistent";

			// When
			const result = await registry.getDefault();

			// Then
			expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining('LLM_PROVIDER="nonexistent" not found'));
			expect(result.name).toEqual("fallback");

			consoleWarn.mockRestore();
		});

		test("should return first healthy provider when no env var set", async () => {
			// Given
			const unhealthyProvider = createMockProvider({
				name: "unhealthy",
				checkHealth: async () => false
			});
			const healthyProvider = createMockProvider({
				name: "healthy",
				checkHealth: async () => true
			});

			registry.register(unhealthyProvider);
			registry.register(healthyProvider);

			// When
			const result = await registry.getDefault();

			// Then
			expect(result.name).toEqual("healthy");
		});

		test("should fall back to first provider when all health checks fail", async () => {
			// Given
			const provider1 = createMockProvider({
				name: "first",
				checkHealth: async () => false
			});
			const provider2 = createMockProvider({
				name: "second",
				checkHealth: async () => false
			});

			registry.register(provider1);
			registry.register(provider2);

			// When
			const result = await registry.getDefault();

			// Then
			expect(result.name).toEqual("first");
		});

		test("should handle health check exceptions gracefully", async () => {
			// Given
			const throwingProvider = createMockProvider({
				name: "throwing",
				checkHealth: async () => {
					throw new Error("Health check failed");
				}
			});
			const healthyProvider = createMockProvider({
				name: "healthy",
				checkHealth: async () => true
			});

			registry.register(throwingProvider);
			registry.register(healthyProvider);

			// When
			const result = await registry.getDefault();

			// Then
			expect(result.name).toEqual("healthy");
		});
	});

	describe("list", () => {
		test("should return empty array when no providers registered", () => {
			// Given
			// When
			const result = registry.list();

			// Then
			expect(result).toEqual([]);
		});

		test("should return all registered provider names", () => {
			// Given
			registry.register(createMockProvider({ name: "provider-a" }));
			registry.register(createMockProvider({ name: "provider-b" }));
			registry.register(createMockProvider({ name: "provider-c" }));

			// When
			const result = registry.list();

			// Then
			expect(result).toEqual(["provider-a", "provider-b", "provider-c"]);
		});

		test("should return names in registration order", () => {
			// Given
			registry.register(createMockProvider({ name: "third" }));
			registry.register(createMockProvider({ name: "first" }));
			registry.register(createMockProvider({ name: "second" }));

			// When
			const result = registry.list();

			// Then
			expect(result).toEqual(["third", "first", "second"]);
		});
	});

	describe("has", () => {
		test("should return true for registered provider", () => {
			// Given
			registry.register(createMockProvider({ name: "exists" }));

			// When / Then
			expect(registry.has("exists")).toEqual(true);
		});

		test("should return false for unknown provider", () => {
			// Given
			// When / Then
			expect(registry.has("unknown")).toEqual(false);
		});

		test("should be case-insensitive", () => {
			// Given
			registry.register(createMockProvider({ name: "casetest" }));

			// When / Then
			expect(registry.has("CASETEST")).toEqual(true);
			expect(registry.has("CaseTest")).toEqual(true);
		});
	});

	describe("unregister", () => {
		test("should remove a registered provider", () => {
			// Given
			registry.register(createMockProvider({ name: "removeme" }));

			expect(registry.has("removeme")).toEqual(true);

			// When
			const result = registry.unregister("removeme");

			// Then
			expect(result).toEqual(true);
			expect(registry.has("removeme")).toEqual(false);
		});

		test("should return false for unknown provider", () => {
			// Given
			// When
			const result = registry.unregister("unknown");

			// Then
			expect(result).toEqual(false);
		});

		test("should be case-insensitive", () => {
			// Given
			registry.register(createMockProvider({ name: "casetest" }));

			// When
			const result = registry.unregister("CASETEST");

			// Then
			expect(result).toEqual(true);
			expect(registry.has("casetest")).toEqual(false);
		});
	});

	describe("clear", () => {
		test("should remove all registered providers", () => {
			// Given
			registry.register(createMockProvider({ name: "a" }));
			registry.register(createMockProvider({ name: "b" }));
			registry.register(createMockProvider({ name: "c" }));

			expect(registry.list().length).toEqual(3);

			// When
			registry.clear();

			// Then
			expect(registry.list().length).toEqual(0);
		});
	});
});

describe("providerRegistry singleton", () => {
	test("should export a ProviderRegistry instance", () => {
		// Given
		// When / Then
		expect(providerRegistry).toBeInstanceOf(ProviderRegistry);
	});

	test("should have expected methods", () => {
		// Given
		// When / Then
		expect(typeof providerRegistry.register).toEqual("function");
		expect(typeof providerRegistry.registerClass).toEqual("function");
		expect(typeof providerRegistry.get).toEqual("function");
		expect(typeof providerRegistry.getDefault).toEqual("function");
		expect(typeof providerRegistry.list).toEqual("function");
		expect(typeof providerRegistry.has).toEqual("function");
		expect(typeof providerRegistry.unregister).toEqual("function");
		expect(typeof providerRegistry.clear).toEqual("function");
	});
});
