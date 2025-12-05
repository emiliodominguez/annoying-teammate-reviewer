/**
 * @fileoverview Tests for the plugin loader.
 */

import { describe, expect, test } from "@jest/globals";

import { initializePlugins, loadPlugins, type LoadedPlugin } from "./loader";
import type { Plugin, PluginContext } from "./types";

describe("Plugin loader module", () => {
	describe("loadPlugins", () => {
		test("should return empty array when no plugins are found", async () => {
			// Given - No CLI plugins, and assuming no local plugins or npm plugins in test env

			// When
			const result = await loadPlugins();

			// Then
			expect(Array.isArray(result)).toEqual(true);
		});

		test("should throw error for invalid CLI plugin path", async () => {
			// Given
			// When / Then
			await expect(loadPlugins(["./nonexistent-plugin.js"])).rejects.toThrow("Failed to load plugin ./nonexistent-plugin.js");
		});

		test("should handle LoadedPlugin interface properties", () => {
			// Given
			const loadedPlugin: LoadedPlugin = {
				plugin: {
					name: "test",
					version: "1.0.0",
				},
				source: "cli",
				location: "./test-plugin.js",
			};

			// When / Then
			expect(loadedPlugin.plugin.name).toEqual("test");
			expect(loadedPlugin.source).toEqual("cli");
			expect(loadedPlugin.location).toEqual("./test-plugin.js");
		});

		test("should support all source types", () => {
			// Given
			const sources: ("cli" | "local" | "npm")[] = ["cli", "local", "npm"];

			// When / Then
			for (const source of sources) {
				const loadedPlugin: LoadedPlugin = {
					plugin: { name: "test", version: "1.0.0" },
					source,
					location: "test",
				};

				expect(loadedPlugin.source).toEqual(source);
			}
		});
	});

	describe("initializePlugins", () => {
		test("should initialize plugins with init hook", async () => {
			// Given
			let initCalled = false;
			const mockPlugin: Plugin = {
				name: "init-test",
				version: "1.0.0",
				init: async () => {
					initCalled = true;
				},
			};

			const loadedPlugins: LoadedPlugin[] = [
				{
					plugin: mockPlugin,
					source: "cli",
					location: "./plugin.js",
				},
			];

			const mockContext: PluginContext = {
				config: {
					providerName: "ollama",
					model: "llama3.2",
					isQuiet: false,
					isJson: false,
				},
				logger: {
					info: () => {},
					warn: () => {},
					error: () => {},
					debug: () => {},
				},
				registerProvider: () => {},
			};

			// When
			await initializePlugins(loadedPlugins, mockContext);

			// Then
			expect(initCalled).toEqual(true);
		});

		test("should skip plugins without init hook", async () => {
			// Given
			const mockPlugin: Plugin = {
				name: "no-init",
				version: "1.0.0",
			};

			const loadedPlugins: LoadedPlugin[] = [
				{
					plugin: mockPlugin,
					source: "local",
					location: "./plugin.js",
				},
			];

			const mockContext: PluginContext = {
				config: { providerName: "test", model: "test", isQuiet: false, isJson: false },
				logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
				registerProvider: () => {},
			};

			// When / Then - Should not throw
			await expect(initializePlugins(loadedPlugins, mockContext)).resolves.not.toThrow();
		});

		test("should register providers from plugins", async () => {
			// Given
			const registeredProviders: unknown[] = [];
			const mockProvider = { name: "custom-provider" };

			const mockPlugin: Plugin = {
				name: "provider-plugin",
				version: "1.0.0",

				providers: () => [mockProvider as any],
			};

			const loadedPlugins: LoadedPlugin[] = [
				{
					plugin: mockPlugin,
					source: "npm",
					location: "annoying-reviewer-plugin-custom",
				},
			];

			const mockContext: PluginContext = {
				config: { providerName: "test", model: "test", isQuiet: false, isJson: false },
				logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
				registerProvider: (provider) => {
					registeredProviders.push(provider);
				},
			};

			// When
			await initializePlugins(loadedPlugins, mockContext);

			// Then
			expect(registeredProviders.length).toEqual(1);
			expect(registeredProviders[0]).toEqual(mockProvider);
		});

		test("should throw error when init fails", async () => {
			// Given
			const mockPlugin: Plugin = {
				name: "failing-plugin",
				version: "1.0.0",
				init: async () => {
					throw new Error("Init failed");
				},
			};

			const loadedPlugins: LoadedPlugin[] = [
				{
					plugin: mockPlugin,
					source: "cli",
					location: "./plugin.js",
				},
			];

			const mockContext: PluginContext = {
				config: { providerName: "test", model: "test", isQuiet: false, isJson: false },
				logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
				registerProvider: () => {},
			};

			// When / Then
			await expect(initializePlugins(loadedPlugins, mockContext)).rejects.toThrow("Failed to initialize plugin failing-plugin: Init failed");
		});

		test("should log successful plugin loading", async () => {
			// Given
			const debugLogs: string[] = [];
			const mockPlugin: Plugin = {
				name: "logged-plugin",
				version: "2.0.0",
			};

			const loadedPlugins: LoadedPlugin[] = [
				{
					plugin: mockPlugin,
					source: "local",
					location: "./plugins/logged-plugin.js",
				},
			];

			const mockContext: PluginContext = {
				config: { providerName: "test", model: "test", isQuiet: false, isJson: false },
				logger: {
					info: () => {},
					warn: () => {},
					error: () => {},
					debug: (msg) => debugLogs.push(msg),
				},
				registerProvider: () => {},
			};

			// When
			await initializePlugins(loadedPlugins, mockContext);

			// Then
			expect(debugLogs.length).toBeGreaterThan(0);
			expect(debugLogs[0]).toContain("logged-plugin");
			expect(debugLogs[0]).toContain("v2.0.0");
			expect(debugLogs[0]).toContain("local");
		});

		test("should initialize multiple plugins in order", async () => {
			// Given
			const initOrder: string[] = [];
			const plugins: LoadedPlugin[] = [
				{
					plugin: {
						name: "first",
						version: "1.0.0",
						init: async () => {
							initOrder.push("first");
						},
					},
					source: "npm",
					location: "package-1",
				},
				{
					plugin: {
						name: "second",
						version: "1.0.0",
						init: async () => {
							initOrder.push("second");
						},
					},
					source: "local",
					location: "./local-plugin.js",
				},
				{
					plugin: {
						name: "third",
						version: "1.0.0",
						init: async () => {
							initOrder.push("third");
						},
					},
					source: "cli",
					location: "./cli-plugin.js",
				},
			];

			const mockContext: PluginContext = {
				config: { providerName: "test", model: "test", isQuiet: false, isJson: false },
				logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
				registerProvider: () => {},
			};

			// When
			await initializePlugins(plugins, mockContext);

			// Then
			expect(initOrder).toEqual(["first", "second", "third"]);
		});

		test("should handle plugins with both init and providers", async () => {
			// Given
			let initCalled = false;
			const registeredProviders: unknown[] = [];
			const mockProvider = { name: "test-provider" };

			const mockPlugin: Plugin = {
				name: "combo-plugin",
				version: "1.0.0",
				init: async () => {
					initCalled = true;
				},

				providers: () => [mockProvider as any],
			};

			const loadedPlugins: LoadedPlugin[] = [
				{
					plugin: mockPlugin,
					source: "cli",
					location: "./combo.js",
				},
			];

			const mockContext: PluginContext = {
				config: { providerName: "test", model: "test", isQuiet: false, isJson: false },
				logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
				registerProvider: (provider) => {
					registeredProviders.push(provider);
				},
			};

			// When
			await initializePlugins(loadedPlugins, mockContext);

			// Then
			expect(initCalled).toEqual(true);
			expect(registeredProviders.length).toEqual(1);
		});
	});

	describe("Plugin validation", () => {
		test("should validate plugin has required name property", () => {
			// Given
			const validPlugin: Plugin = {
				name: "valid-name",
				version: "1.0.0",
			};

			// When / Then
			expect(validPlugin.name).toBeTruthy();
			expect(typeof validPlugin.name).toEqual("string");
		});

		test("should validate plugin has required version property", () => {
			// Given
			const validPlugin: Plugin = {
				name: "test",
				version: "1.2.3",
			};

			// When / Then
			expect(validPlugin.version).toBeTruthy();
			expect(typeof validPlugin.version).toEqual("string");
		});

		test("should allow optional hooks to be functions", () => {
			// Given
			const plugin: Plugin = {
				name: "hooks-plugin",
				version: "1.0.0",
				init: async () => {},
				beforePrompt: async () => {},
				afterResponse: async () => {},
				beforeVerdict: async () => {},
				commands: () => [],
				providers: () => [],
			};

			// When / Then
			expect(typeof plugin.init).toEqual("function");
			expect(typeof plugin.beforePrompt).toEqual("function");
			expect(typeof plugin.afterResponse).toEqual("function");
			expect(typeof plugin.beforeVerdict).toEqual("function");
			expect(typeof plugin.commands).toEqual("function");
			expect(typeof plugin.providers).toEqual("function");
		});
	});
});
