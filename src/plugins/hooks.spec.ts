/**
 * @fileoverview Tests for the plugin hooks execution engine.
 */

import { beforeEach, describe, expect, jest, test } from "@jest/globals";

import { createEmptyHookManager, HookManager } from "./hooks";
import type { LoadedPlugin } from "./loader";
import type { Logger, Plugin, ReviewContext } from "./types";

/**
 * Creates a mock logger for testing.
 */
function createMockLogger(): Logger & { warnings: string[] } {
	const warnings: string[] = [];

	return {
		warnings,
		info: () => {},
		warn: (msg: string) => warnings.push(msg),
		error: () => {},
		debug: () => {},
	};
}

/**
 * Creates a mock plugin for testing.
 */
function createMockPlugin(overrides: Partial<Plugin> = {}): Plugin {
	return {
		name: "mock-plugin",
		version: "1.0.0",
		...overrides,
	};
}

/**
 * Creates a loaded plugin wrapper.
 */
function createLoadedPlugin(plugin: Plugin): LoadedPlugin {
	return {
		plugin,
		source: "cli",
		location: "./mock-plugin.js",
	};
}

describe("HookManager", () => {
	let hookManager: HookManager;
	let mockLogger: Logger & { warnings: string[] };
	const mockReviewContext: ReviewContext = {
		mode: "staged changes",
		branch: "feature/test",
		fileCount: 3,
	};

	beforeEach(() => {
		mockLogger = createMockLogger();
		hookManager = new HookManager([], mockLogger);
	});

	describe("constructor", () => {
		test("should create HookManager with empty plugins", () => {
			// Given
			// When
			const manager = new HookManager([], mockLogger);

			// Then
			expect(manager.pluginCount).toEqual(0);
		});

		test("should create HookManager with plugins", () => {
			// Given
			const plugins = [createLoadedPlugin(createMockPlugin({ name: "plugin-1" })), createLoadedPlugin(createMockPlugin({ name: "plugin-2" }))];

			// When
			const manager = new HookManager(plugins, mockLogger);

			// Then
			expect(manager.pluginCount).toEqual(2);
		});
	});

	describe("pluginCount", () => {
		test("should return 0 for no plugins", () => {
			// Given
			const manager = new HookManager([], mockLogger);

			// When / Then
			expect(manager.pluginCount).toEqual(0);
		});

		test("should return correct count", () => {
			// Given
			const plugins = [
				createLoadedPlugin(createMockPlugin({ name: "a" })),
				createLoadedPlugin(createMockPlugin({ name: "b" })),
				createLoadedPlugin(createMockPlugin({ name: "c" })),
			];
			const manager = new HookManager(plugins, mockLogger);

			// When / Then
			expect(manager.pluginCount).toEqual(3);
		});
	});

	describe("getPluginInfo", () => {
		test("should return empty array for no plugins", () => {
			// Given
			const manager = new HookManager([], mockLogger);

			// When
			const info = manager.getPluginInfo();

			// Then
			expect(info).toEqual([]);
		});

		test("should return plugin names and versions", () => {
			// Given
			const plugins = [
				createLoadedPlugin(createMockPlugin({ name: "plugin-a", version: "1.0.0" })),
				createLoadedPlugin(createMockPlugin({ name: "plugin-b", version: "2.0.0" })),
			];
			const manager = new HookManager(plugins, mockLogger);

			// When
			const info = manager.getPluginInfo();

			// Then
			expect(info).toEqual([
				{ name: "plugin-a", version: "1.0.0" },
				{ name: "plugin-b", version: "2.0.0" },
			]);
		});
	});

	describe("runBeforePrompt", () => {
		test("should return original prompt when no plugins", async () => {
			// Given
			const manager = new HookManager([], mockLogger);

			// When
			const result = await manager.runBeforePrompt("diff content", "Original prompt", mockReviewContext);

			// Then
			expect(result).toEqual("Original prompt");
		});

		test("should return original prompt when no plugins have beforePrompt", async () => {
			// Given
			const plugins = [createLoadedPlugin(createMockPlugin())];
			const manager = new HookManager(plugins, mockLogger);

			// When
			const result = await manager.runBeforePrompt("diff", "Original", mockReviewContext);

			// Then
			expect(result).toEqual("Original");
		});

		test("should allow plugin to add to prompt", async () => {
			// Given
			const plugin = createMockPlugin({
				beforePrompt: async (context) => {
					context.addToPrompt(" Additional instructions.");
				},
			});
			const manager = new HookManager([createLoadedPlugin(plugin)], mockLogger);

			// When
			const result = await manager.runBeforePrompt("diff", "Original prompt", mockReviewContext);

			// Then
			expect(result).toEqual("Original prompt Additional instructions.");
		});

		test("should allow plugin to replace prompt", async () => {
			// Given
			const plugin = createMockPlugin({
				beforePrompt: async (context) => {
					context.setPrompt("Completely new prompt");
				},
			});
			const manager = new HookManager([createLoadedPlugin(plugin)], mockLogger);

			// When
			const result = await manager.runBeforePrompt("diff", "Original", mockReviewContext);

			// Then
			expect(result).toEqual("Completely new prompt");
		});

		test("should chain modifications from multiple plugins", async () => {
			// Given
			const plugin1 = createMockPlugin({
				name: "plugin-1",
				beforePrompt: async (context) => {
					context.addToPrompt(" [Plugin 1]");
				},
			});
			const plugin2 = createMockPlugin({
				name: "plugin-2",
				beforePrompt: async (context) => {
					context.addToPrompt(" [Plugin 2]");
				},
			});
			const manager = new HookManager([createLoadedPlugin(plugin1), createLoadedPlugin(plugin2)], mockLogger);

			// When
			const result = await manager.runBeforePrompt("diff", "Base", mockReviewContext);

			// Then
			expect(result).toEqual("Base [Plugin 1] [Plugin 2]");
		});

		test("should handle plugin errors gracefully", async () => {
			// Given
			const failingPlugin = createMockPlugin({
				name: "failing",
				beforePrompt: async () => {
					throw new Error("Plugin error");
				},
			});
			const workingPlugin = createMockPlugin({
				name: "working",
				beforePrompt: async (context) => {
					context.addToPrompt(" [Working]");
				},
			});
			const manager = new HookManager([createLoadedPlugin(failingPlugin), createLoadedPlugin(workingPlugin)], mockLogger);

			// When
			const result = await manager.runBeforePrompt("diff", "Base", mockReviewContext);

			// Then
			expect(result).toEqual("Base [Working]");
			expect(mockLogger.warnings.length).toBeGreaterThan(0);
			expect(mockLogger.warnings[0]).toContain("failing");
		});

		test("should provide context properties to plugin", async () => {
			// Given
			let receivedDiff = "";
			let receivedPrompt = "";
			let receivedContext: ReviewContext | null = null;

			const plugin = createMockPlugin({
				beforePrompt: async (context) => {
					receivedDiff = context.diff;
					receivedPrompt = context.prompt;
					receivedContext = context.reviewContext;
				},
			});
			const manager = new HookManager([createLoadedPlugin(plugin)], mockLogger);

			// When
			await manager.runBeforePrompt("test diff", "test prompt", mockReviewContext);

			// Then
			expect(receivedDiff).toEqual("test diff");
			expect(receivedPrompt).toEqual("test prompt");
			expect(receivedContext).toEqual(mockReviewContext);
		});
	});

	describe("runAfterResponse", () => {
		test("should return original response when no plugins", async () => {
			// Given
			const manager = new HookManager([], mockLogger);

			// When
			const result = await manager.runAfterResponse("Original response", mockReviewContext, "model", "provider");

			// Then
			expect(result).toEqual("Original response");
		});

		test("should return original response when no plugins have afterResponse", async () => {
			// Given
			const plugins = [createLoadedPlugin(createMockPlugin())];
			const manager = new HookManager(plugins, mockLogger);

			// When
			const result = await manager.runAfterResponse("Original", mockReviewContext, "model", "provider");

			// Then
			expect(result).toEqual("Original");
		});

		test("should allow plugin to modify response", async () => {
			// Given
			const plugin = createMockPlugin({
				afterResponse: async (context) => {
					context.setResponse(`${context.response} [Modified]`);
				},
			});
			const manager = new HookManager([createLoadedPlugin(plugin)], mockLogger);

			// When
			const result = await manager.runAfterResponse("Response", mockReviewContext, "model", "provider");

			// Then
			expect(result).toEqual("Response [Modified]");
		});

		test("should chain modifications from multiple plugins", async () => {
			// Given
			const plugin1 = createMockPlugin({
				name: "p1",
				afterResponse: async (context) => {
					context.setResponse(`${context.response} [P1]`);
				},
			});
			const plugin2 = createMockPlugin({
				name: "p2",
				afterResponse: async (context) => {
					context.setResponse(`${context.response} [P2]`);
				},
			});
			const manager = new HookManager([createLoadedPlugin(plugin1), createLoadedPlugin(plugin2)], mockLogger);

			// When
			const result = await manager.runAfterResponse("Base", mockReviewContext, "model", "provider");

			// Then
			expect(result).toEqual("Base [P1] [P2]");
		});

		test("should handle plugin errors gracefully", async () => {
			// Given
			const failingPlugin = createMockPlugin({
				name: "failing",
				afterResponse: async () => {
					throw new Error("Error");
				},
			});
			const manager = new HookManager([createLoadedPlugin(failingPlugin)], mockLogger);

			// When
			const result = await manager.runAfterResponse("Response", mockReviewContext, "model", "provider");

			// Then
			expect(result).toEqual("Response");
			expect(mockLogger.warnings.length).toBeGreaterThan(0);
		});

		test("should provide context properties to plugin", async () => {
			// Given
			let receivedModel = "";
			let receivedProvider = "";
			let receivedContext: ReviewContext | null = null;

			const plugin = createMockPlugin({
				afterResponse: async (context) => {
					receivedModel = context.model;
					receivedProvider = context.providerName;
					receivedContext = context.reviewContext;
				},
			});
			const manager = new HookManager([createLoadedPlugin(plugin)], mockLogger);

			// When
			await manager.runAfterResponse("response", mockReviewContext, "test-model", "test-provider");

			// Then
			expect(receivedModel).toEqual("test-model");
			expect(receivedProvider).toEqual("test-provider");
			expect(receivedContext).toEqual(mockReviewContext);
		});
	});

	describe("runBeforeVerdict", () => {
		test("should return original verdict when no plugins", async () => {
			// Given
			const manager = new HookManager([], mockLogger);

			// When
			const result = await manager.runBeforeVerdict("response", "approve");

			// Then
			expect(result).toEqual("approve");
		});

		test("should return original verdict when no plugins have beforeVerdict", async () => {
			// Given
			const plugins = [createLoadedPlugin(createMockPlugin())];
			const manager = new HookManager(plugins, mockLogger);

			// When
			const result = await manager.runBeforeVerdict("response", "request-changes");

			// Then
			expect(result).toEqual("request-changes");
		});

		test("should allow plugin to override verdict", async () => {
			// Given
			const plugin = createMockPlugin({
				beforeVerdict: async (context) => {
					context.setVerdict("block");
				},
			});
			const manager = new HookManager([createLoadedPlugin(plugin)], mockLogger);

			// When
			const result = await manager.runBeforeVerdict("response", "approve");

			// Then
			expect(result).toEqual("block");
		});

		test("should use last plugin's verdict when multiple plugins set verdict", async () => {
			// Given
			const plugin1 = createMockPlugin({
				name: "p1",
				beforeVerdict: async (context) => {
					context.setVerdict("approve");
				},
			});
			const plugin2 = createMockPlugin({
				name: "p2",
				beforeVerdict: async (context) => {
					context.setVerdict("block");
				},
			});
			const manager = new HookManager([createLoadedPlugin(plugin1), createLoadedPlugin(plugin2)], mockLogger);

			// When
			const result = await manager.runBeforeVerdict("response", "unknown");

			// Then
			expect(result).toEqual("block");
		});

		test("should handle plugin errors gracefully", async () => {
			// Given
			const failingPlugin = createMockPlugin({
				name: "failing",
				beforeVerdict: async () => {
					throw new Error("Error");
				},
			});
			const manager = new HookManager([createLoadedPlugin(failingPlugin)], mockLogger);

			// When
			const result = await manager.runBeforeVerdict("response", "approve");

			// Then
			expect(result).toEqual("approve");
			expect(mockLogger.warnings.length).toBeGreaterThan(0);
		});

		test("should provide context properties to plugin", async () => {
			// Given
			let receivedResponse = "";
			let receivedVerdict: "approve" | "request-changes" | "block" | "unknown" = "unknown";

			const plugin = createMockPlugin({
				beforeVerdict: async (context) => {
					receivedResponse = context.response;
					receivedVerdict = context.verdict;
				},
			});
			const manager = new HookManager([createLoadedPlugin(plugin)], mockLogger);

			// When
			await manager.runBeforeVerdict("test response", "request-changes");

			// Then
			expect(receivedResponse).toEqual("test response");
			expect(receivedVerdict).toEqual("request-changes");
		});

		test("should support all verdict types", async () => {
			// Given
			const verdicts: ("approve" | "request-changes" | "block" | "unknown")[] = ["approve", "request-changes", "block", "unknown"];

			// When / Then
			for (const verdict of verdicts) {
				const manager = new HookManager([], mockLogger);
				const result = await manager.runBeforeVerdict("response", verdict);

				expect(result).toEqual(verdict);
			}
		});
	});

	describe("getAllCommands", () => {
		test("should return empty array when no plugins", () => {
			// Given
			const manager = new HookManager([], mockLogger);

			// When
			const commands = manager.getAllCommands();

			// Then
			expect(commands).toEqual([]);
		});

		test("should return empty array when no plugins have commands", () => {
			// Given
			const plugins = [createLoadedPlugin(createMockPlugin())];
			const manager = new HookManager(plugins, mockLogger);

			// When
			const commands = manager.getAllCommands();

			// Then
			expect(commands).toEqual([]);
		});

		test("should collect commands from plugins", () => {
			// Given
			const plugin = createMockPlugin({
				commands: () => [
					{
						name: "cmd1",
						description: "Command 1",
						handler: async () => {},
					},
					{
						name: "cmd2",
						description: "Command 2",
						handler: async () => {},
					},
				],
			});
			const manager = new HookManager([createLoadedPlugin(plugin)], mockLogger);

			// When
			const commands = manager.getAllCommands();

			// Then
			expect(commands.length).toEqual(2);
			expect(commands[0].plugin).toEqual("mock-plugin");
			expect(commands[0].command.name).toEqual("cmd1");
			expect(commands[1].command.name).toEqual("cmd2");
		});

		test("should collect commands from multiple plugins", () => {
			// Given
			const plugin1 = createMockPlugin({
				name: "plugin-1",
				commands: () => [{ name: "cmd-a", description: "A", handler: async () => {} }],
			});
			const plugin2 = createMockPlugin({
				name: "plugin-2",
				commands: () => [{ name: "cmd-b", description: "B", handler: async () => {} }],
			});
			const manager = new HookManager([createLoadedPlugin(plugin1), createLoadedPlugin(plugin2)], mockLogger);

			// When
			const commands = manager.getAllCommands();

			// Then
			expect(commands.length).toEqual(2);
			expect(commands[0].plugin).toEqual("plugin-1");
			expect(commands[1].plugin).toEqual("plugin-2");
		});

		test("should handle plugin command errors gracefully", () => {
			// Given
			const failingPlugin = createMockPlugin({
				name: "failing",
				commands: () => {
					throw new Error("Commands error");
				},
			});
			const workingPlugin = createMockPlugin({
				name: "working",
				commands: () => [{ name: "good", description: "Good", handler: async () => {} }],
			});
			const manager = new HookManager([createLoadedPlugin(failingPlugin), createLoadedPlugin(workingPlugin)], mockLogger);

			// When
			const commands = manager.getAllCommands();

			// Then
			expect(commands.length).toEqual(1);
			expect(commands[0].plugin).toEqual("working");
			expect(mockLogger.warnings.length).toBeGreaterThan(0);
		});
	});
});

describe("createEmptyHookManager", () => {
	test("should create HookManager with no plugins", () => {
		// Given
		const logger = createMockLogger();

		// When
		const manager = createEmptyHookManager(logger);

		// Then
		expect(manager).toBeInstanceOf(HookManager);
		expect(manager.pluginCount).toEqual(0);
	});

	test("should return original values from hooks", async () => {
		// Given
		const logger = createMockLogger();
		const manager = createEmptyHookManager(logger);
		const context: ReviewContext = { mode: "test", branch: "main", fileCount: 1 };

		// When
		const prompt = await manager.runBeforePrompt("diff", "prompt", context);
		const response = await manager.runAfterResponse("response", context, "model", "provider");
		const verdict = await manager.runBeforeVerdict("response", "approve");
		const commands = manager.getAllCommands();

		// Then
		expect(prompt).toEqual("prompt");
		expect(response).toEqual("response");
		expect(verdict).toEqual("approve");
		expect(commands).toEqual([]);
	});
});
