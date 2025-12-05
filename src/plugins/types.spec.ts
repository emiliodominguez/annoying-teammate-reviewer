/**
 * @fileoverview Tests for plugin types.
 *
 * Since types.ts is mostly TypeScript interfaces (which don't exist at runtime),
 * these tests verify that the module exports correctly and can be used.
 */

import { describe, expect, test } from "@jest/globals";

import type {
	AfterResponseContext,
	BeforePromptContext,
	BeforeVerdictContext,
	CommandDefinition,
	Logger,
	Plugin,
	PluginContext,
	ReviewContext
} from "./types";

describe("Plugin types module", () => {
	describe("ReviewContext interface", () => {
		test("should allow creating valid ReviewContext objects", () => {
			// Given
			const context: ReviewContext = {
				mode: "staged changes",
				branch: "feature/test",
				fileCount: 5,
				commits: "abc123: Initial commit",
				files: ["src/index.ts", "src/utils.ts"]
			};

			// When / Then
			expect(context.mode).toEqual("staged changes");
			expect(context.branch).toEqual("feature/test");
			expect(context.fileCount).toEqual(5);
			expect(context.commits).toEqual("abc123: Initial commit");
			expect(context.files).toEqual(["src/index.ts", "src/utils.ts"]);
		});

		test("should allow ReviewContext without optional properties", () => {
			// Given
			const context: ReviewContext = {
				mode: "branch comparison",
				branch: "main",
				fileCount: 1
			};

			// When / Then
			expect(context.mode).toEqual("branch comparison");
			expect(context.commits).toBeUndefined();
			expect(context.files).toBeUndefined();
		});
	});

	describe("BeforePromptContext interface", () => {
		test("should allow creating valid BeforePromptContext objects", () => {
			// Given
			let modifiedPrompt = "";
			const context: BeforePromptContext = {
				diff: "--- a/file.ts\n+++ b/file.ts",
				reviewContext: {
					mode: "staged",
					branch: "main",
					fileCount: 1
				},
				prompt: "Review this code",
				addToPrompt: (text: string) => {
					modifiedPrompt += text;
				},
				setPrompt: (newPrompt: string) => {
					modifiedPrompt = newPrompt;
				}
			};

			// When
			context.addToPrompt(" with security focus");

			// Then
			expect(context.diff).toContain("file.ts");
			expect(context.prompt).toEqual("Review this code");
			expect(modifiedPrompt).toEqual(" with security focus");
		});

		test("should allow replacing the entire prompt", () => {
			// Given
			let currentPrompt = "Original prompt";
			const context: BeforePromptContext = {
				diff: "diff content",
				reviewContext: { mode: "staged", branch: "main", fileCount: 1 },
				prompt: currentPrompt,
				addToPrompt: (text) => {
					currentPrompt += text;
				},
				setPrompt: (newPrompt) => {
					currentPrompt = newPrompt;
				}
			};

			// When
			context.setPrompt("Completely new prompt");

			// Then
			expect(currentPrompt).toEqual("Completely new prompt");
		});
	});

	describe("AfterResponseContext interface", () => {
		test("should allow creating valid AfterResponseContext objects", () => {
			// Given
			let modifiedResponse = "";
			const context: AfterResponseContext = {
				response: "LGTM! The code looks good.",
				reviewContext: { mode: "staged", branch: "main", fileCount: 1 },
				model: "llama3.2",
				providerName: "ollama",
				setResponse: (newResponse: string) => {
					modifiedResponse = newResponse;
				}
			};

			// When
			context.setResponse("Modified response");

			// Then
			expect(context.response).toEqual("LGTM! The code looks good.");
			expect(context.model).toEqual("llama3.2");
			expect(context.providerName).toEqual("ollama");
			expect(modifiedResponse).toEqual("Modified response");
		});
	});

	describe("BeforeVerdictContext interface", () => {
		test("should allow creating valid BeforeVerdictContext objects", () => {
			// Given
			let currentVerdict: "approve" | "request-changes" | "block" | "unknown" = "approve";
			const context: BeforeVerdictContext = {
				response: "LGTM!",
				verdict: "approve",
				setVerdict: (newVerdict) => {
					currentVerdict = newVerdict;
				}
			};

			// When
			context.setVerdict("block");

			// Then
			expect(context.response).toEqual("LGTM!");
			expect(context.verdict).toEqual("approve");
			expect(currentVerdict).toEqual("block");
		});

		test("should support all verdict types", () => {
			// Given
			const verdicts: Array<"approve" | "request-changes" | "block" | "unknown"> = ["approve", "request-changes", "block", "unknown"];

			// When / Then
			for (const verdict of verdicts) {
				const context: BeforeVerdictContext = {
					response: "test",
					verdict,
					setVerdict: () => {}
				};

				expect(context.verdict).toEqual(verdict);
			}
		});
	});

	describe("CommandDefinition interface", () => {
		test("should allow creating valid CommandDefinition objects", () => {
			// Given
			const command: CommandDefinition = {
				name: "fix-issues",
				description: "Automatically fix detected issues",
				options: [
					{
						flags: "--dry-run",
						description: "Show what would be fixed without making changes",
						defaultValue: false
					}
				],
				handler: async (args) => {
					expect(args).toBeDefined();
				}
			};

			// When / Then
			expect(command.name).toEqual("fix-issues");
			expect(command.description).toContain("fix");
			expect(command.options?.length).toEqual(1);
			expect(typeof command.handler).toEqual("function");
		});

		test("should allow CommandDefinition without options", () => {
			// Given
			const command: CommandDefinition = {
				name: "simple-command",
				description: "A simple command",
				handler: async () => {}
			};

			// When / Then
			expect(command.name).toEqual("simple-command");
			expect(command.options).toBeUndefined();
		});
	});

	describe("Logger interface", () => {
		test("should allow creating valid Logger objects", () => {
			// Given
			const logs: string[] = [];
			const logger: Logger = {
				info: (msg) => logs.push(`INFO: ${msg}`),
				warn: (msg) => logs.push(`WARN: ${msg}`),
				error: (msg) => logs.push(`ERROR: ${msg}`),
				debug: (msg) => logs.push(`DEBUG: ${msg}`)
			};

			// When
			logger.info("Information");
			logger.warn("Warning");
			logger.error("Error");
			logger.debug("Debug");

			// Then
			expect(logs).toEqual(["INFO: Information", "WARN: Warning", "ERROR: Error", "DEBUG: Debug"]);
		});
	});

	describe("PluginContext interface", () => {
		test("should allow creating valid PluginContext objects", () => {
			// Given
			const registeredProviders: unknown[] = [];
			const context: PluginContext = {
				config: {
					providerName: "ollama",
					model: "llama3.2",
					isQuiet: false,
					isJson: false
				},
				logger: {
					info: () => {},
					warn: () => {},
					error: () => {},
					debug: () => {}
				},
				registerProvider: (provider) => {
					registeredProviders.push(provider);
				}
			};

			// When
			context.registerProvider({ name: "custom" } as Parameters<typeof context.registerProvider>[0]);

			// Then
			expect(context.config.providerName).toEqual("ollama");
			expect(context.config.model).toEqual("llama3.2");
			expect(registeredProviders.length).toEqual(1);
		});
	});

	describe("Plugin interface", () => {
		test("should allow creating minimal Plugin objects", () => {
			// Given
			const plugin: Plugin = {
				name: "minimal-plugin",
				version: "1.0.0"
			};

			// When / Then
			expect(plugin.name).toEqual("minimal-plugin");
			expect(plugin.version).toEqual("1.0.0");
			expect(plugin.init).toBeUndefined();
			expect(plugin.beforePrompt).toBeUndefined();
		});

		test("should allow creating full-featured Plugin objects", () => {
			// Given
			const plugin: Plugin = {
				name: "full-plugin",
				version: "2.0.0",
				description: "A fully-featured plugin",
				init: async (context) => {
					context.logger.info("Plugin initialized");
				},
				beforePrompt: async (context) => {
					context.addToPrompt(" Check for security issues.");
				},
				afterResponse: async (context) => {
					context.setResponse(context.response + "\n---");
				},
				beforeVerdict: async (context) => {
					if (context.response.includes("security")) {
						context.setVerdict("block");
					}
				},
				commands: () => [
					{
						name: "custom",
						description: "Custom command",
						handler: async () => {}
					}
				],
				providers: () => []
			};

			// When / Then
			expect(plugin.name).toEqual("full-plugin");
			expect(plugin.version).toEqual("2.0.0");
			expect(plugin.description).toContain("featured");
			expect(typeof plugin.init).toEqual("function");
			expect(typeof plugin.beforePrompt).toEqual("function");
			expect(typeof plugin.afterResponse).toEqual("function");
			expect(typeof plugin.beforeVerdict).toEqual("function");
			expect(typeof plugin.commands).toEqual("function");
			expect(typeof plugin.providers).toEqual("function");
		});

		test("should allow calling Plugin hooks", async () => {
			// Given
			let initCalled = false;
			let beforePromptCalled = false;
			let afterResponseCalled = false;
			let beforeVerdictCalled = false;

			const plugin: Plugin = {
				name: "test-hooks",
				version: "1.0.0",
				init: async () => {
					initCalled = true;
				},
				beforePrompt: async () => {
					beforePromptCalled = true;
				},
				afterResponse: async () => {
					afterResponseCalled = true;
				},
				beforeVerdict: async () => {
					beforeVerdictCalled = true;
				}
			};

			// When
			await plugin.init!({
				config: { providerName: "test", model: "test", isQuiet: false, isJson: false },
				logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
				registerProvider: () => {}
			});

			await plugin.beforePrompt!({
				diff: "",
				reviewContext: { mode: "", branch: "", fileCount: 0 },
				prompt: "",
				addToPrompt: () => {},
				setPrompt: () => {}
			});

			await plugin.afterResponse!({
				response: "",
				reviewContext: { mode: "", branch: "", fileCount: 0 },
				model: "",
				providerName: "",
				setResponse: () => {}
			});

			await plugin.beforeVerdict!({
				response: "",
				verdict: "unknown",
				setVerdict: () => {}
			});

			// Then
			expect(initCalled).toEqual(true);
			expect(beforePromptCalled).toEqual(true);
			expect(afterResponseCalled).toEqual(true);
			expect(beforeVerdictCalled).toEqual(true);
		});

		test("should allow Plugin.commands to return command definitions", () => {
			// Given
			const plugin: Plugin = {
				name: "commands-plugin",
				version: "1.0.0",
				commands: () => [
					{
						name: "cmd1",
						description: "Command 1",
						handler: async () => {}
					},
					{
						name: "cmd2",
						description: "Command 2",
						options: [{ flags: "-v", description: "Verbose" }],
						handler: async () => {}
					}
				]
			};

			// When
			const commands = plugin.commands!();

			// Then
			expect(commands.length).toEqual(2);
			expect(commands[0].name).toEqual("cmd1");
			expect(commands[1].name).toEqual("cmd2");
		});
	});
});
