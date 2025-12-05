/**
 * @fileoverview Hook execution engine for plugin integration.
 *
 * This module manages the execution of plugin hooks at various points
 * in the review pipeline.
 *
 * ## AI Concept: Hook Execution Model
 *
 * Hooks follow a waterfall pattern where each plugin's hook can
 * modify the context before passing to the next:
 *
 * ```
 * Plugin A: beforePrompt → modifies prompt
 *           ↓
 * Plugin B: beforePrompt → adds more context
 *           ↓
 * Plugin C: beforePrompt → final modifications
 *           ↓
 * [Continue with modified prompt]
 * ```
 *
 * This allows plugins to build on each other's modifications.
 *
 * ## AI Concept: Error Handling in Hooks
 *
 * Hook errors are handled gracefully:
 * - Errors are logged but don't crash the review
 * - Subsequent plugins still run
 * - The core review continues with last known good state
 *
 * This ensures one buggy plugin doesn't break the entire tool.
 */

import type { AfterResponseContext, BeforePromptContext, BeforeVerdictContext, Logger, Plugin, ReviewContext } from "./types";
import type { LoadedPlugin } from "./loader";

/**
 * Hook manager for executing plugin hooks.
 *
 * ## AI Concept: Centralized Hook Management
 *
 * The HookManager:
 * - Maintains the list of active plugins
 * - Provides methods to execute each hook type
 * - Handles errors gracefully
 * - Ensures hooks run in the correct order
 *
 * ## Usage
 *
 * ```typescript
 * const hookManager = new HookManager(loadedPlugins, logger);
 *
 * // Before sending prompt
 * const modifiedPrompt = await hookManager.runBeforePrompt(prompt, context);
 *
 * // After receiving response
 * const modifiedResponse = await hookManager.runAfterResponse(response, context);
 *
 * // Before extracting verdict
 * const finalVerdict = await hookManager.runBeforeVerdict(response, verdict);
 * ```
 */
export class HookManager {
	private plugins: Plugin[];
	private logger: Logger;

	/**
	 * Creates a new HookManager.
	 *
	 * @param loadedPlugins - Array of loaded plugins
	 * @param logger - Logger for hook output
	 */
	constructor(loadedPlugins: LoadedPlugin[], logger: Logger) {
		this.plugins = loadedPlugins.map((lp) => lp.plugin);
		this.logger = logger;
	}

	/**
	 * Runs the beforePrompt hook for all plugins.
	 *
	 * ## AI Concept: Prompt Modification Chain
	 *
	 * Each plugin can modify the prompt. Changes accumulate:
	 * ```
	 * Original: "Review this code"
	 * Plugin A: "Review this code. Check for security issues."
	 * Plugin B: "Review this code. Check for security issues. Follow ESLint rules."
	 * Final:    "Review this code. Check for security issues. Follow ESLint rules."
	 * ```
	 *
	 * @param diff - The diff being reviewed
	 * @param prompt - Initial prompt
	 * @param reviewContext - Review context
	 * @returns Modified prompt
	 */
	async runBeforePrompt(diff: string, prompt: string, reviewContext: ReviewContext): Promise<string> {
		let currentPrompt = prompt;

		for (const plugin of this.plugins) {
			if (!plugin.beforePrompt) continue;

			try {
				const context: BeforePromptContext = {
					diff,
					reviewContext,
					prompt: currentPrompt,
					addToPrompt: (text: string) => {
						currentPrompt += text;
					},
					setPrompt: (newPrompt: string) => {
						currentPrompt = newPrompt;
					}
				};

				await plugin.beforePrompt(context);
			} catch (error) {
				this.logger.warn(`Plugin ${plugin.name} beforePrompt hook failed: ${(error as Error).message}`);
				// Continue with other plugins
			}
		}

		return currentPrompt;
	}

	/**
	 * Runs the afterResponse hook for all plugins.
	 *
	 * ## AI Concept: Response Processing
	 *
	 * Plugins can analyze or transform the LLM response.
	 * Use cases:
	 * - Extract metrics
	 * - Post to external services
	 * - Transform output format
	 * - Add additional context
	 *
	 * @param response - Raw LLM response
	 * @param reviewContext - Review context
	 * @param model - Model used
	 * @param providerName - Provider used
	 * @returns Modified response
	 */
	async runAfterResponse(response: string, reviewContext: ReviewContext, model: string, providerName: string): Promise<string> {
		let currentResponse = response;

		for (const plugin of this.plugins) {
			if (!plugin.afterResponse) continue;

			try {
				const context: AfterResponseContext = {
					response: currentResponse,
					reviewContext,
					model,
					providerName,
					setResponse: (newResponse: string) => {
						currentResponse = newResponse;
					}
				};

				await plugin.afterResponse(context);
			} catch (error) {
				this.logger.warn(`Plugin ${plugin.name} afterResponse hook failed: ${(error as Error).message}`);
			}
		}

		return currentResponse;
	}

	/**
	 * Runs the beforeVerdict hook for all plugins.
	 *
	 * ## AI Concept: Verdict Override
	 *
	 * Plugins can override the extracted verdict. Use cases:
	 * - Force block on security issues
	 * - Custom approval rules
	 * - Integration with external systems
	 *
	 * The last plugin to set a verdict wins.
	 *
	 * @param response - LLM response
	 * @param verdict - Initially extracted verdict
	 * @returns Final verdict
	 */
	async runBeforeVerdict(
		response: string,
		verdict: "approve" | "request-changes" | "block" | "unknown"
	): Promise<"approve" | "request-changes" | "block" | "unknown"> {
		let currentVerdict = verdict;

		for (const plugin of this.plugins) {
			if (!plugin.beforeVerdict) continue;

			try {
				const context: BeforeVerdictContext = {
					response,
					verdict: currentVerdict,
					setVerdict: (newVerdict) => {
						currentVerdict = newVerdict;
					}
				};

				await plugin.beforeVerdict(context);
			} catch (error) {
				this.logger.warn(`Plugin ${plugin.name} beforeVerdict hook failed: ${(error as Error).message}`);
			}
		}

		return currentVerdict;
	}

	/**
	 * Gets all custom commands from plugins.
	 *
	 * ## AI Concept: Command Aggregation
	 *
	 * Plugins can add CLI commands. This method collects all
	 * commands from all plugins for registration with Commander.
	 *
	 * @returns Array of command definitions with plugin source
	 */
	getAllCommands(): Array<{ plugin: string; command: ReturnType<NonNullable<Plugin["commands"]>>[number] }> {
		const commands: Array<{ plugin: string; command: ReturnType<NonNullable<Plugin["commands"]>>[number] }> = [];

		for (const plugin of this.plugins) {
			if (!plugin.commands) continue;

			try {
				const pluginCommands = plugin.commands();

				for (const command of pluginCommands) {
					commands.push({ plugin: plugin.name, command });
				}
			} catch (error) {
				this.logger.warn(`Plugin ${plugin.name} commands() failed: ${(error as Error).message}`);
			}
		}

		return commands;
	}

	/**
	 * Gets the number of loaded plugins.
	 */
	get pluginCount(): number {
		return this.plugins.length;
	}

	/**
	 * Gets plugin names and versions.
	 */
	getPluginInfo(): Array<{ name: string; version: string }> {
		return this.plugins.map((p) => ({ name: p.name, version: p.version }));
	}
}

/**
 * Creates a no-op HookManager for when no plugins are loaded.
 *
 * ## AI Concept: Null Object Pattern
 *
 * Instead of checking "if plugins exist" everywhere, we create
 * a HookManager that does nothing. This simplifies the core code.
 *
 * @param logger - Logger instance
 * @returns Empty HookManager
 */
export function createEmptyHookManager(logger: Logger): HookManager {
	return new HookManager([], logger);
}
