/**
 * @fileoverview Hook execution engine for plugin integration.
 *
 * This module manages the execution of plugin hooks at various points
 * in the review pipeline.
 */

import type { AfterResponseContext, BeforePromptContext, BeforeVerdictContext, Logger, Plugin, ReviewContext } from "./types";
import type { LoadedPlugin } from "./loader";

/**
 * Hook manager for executing plugin hooks.
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
	/** Array of active plugins. */
	private plugins: Plugin[];

	/** Logger for hook output. */
	private logger: Logger;

	/** Gets the number of loaded plugins. */
	get pluginCount(): number {
		return this.plugins.length;
	}

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
	 * ## AI Concept: Prompt Modification
	 *
	 * Each plugin can modify the prompt before it's sent to the LLM.
	 * This allows plugins to inject additional context, rules, or instructions.
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
					},
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
					},
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
	 * ## AI Concept: Verdict Customization
	 *
	 * Plugins can override the AI's extracted verdict based on custom rules.
	 * Useful for enforcing security policies or integrating with external systems.
	 *
	 * @param response - LLM response
	 * @param verdict - Initially extracted verdict
	 * @returns Final verdict
	 */
	async runBeforeVerdict(
		response: string,
		verdict: "approve" | "request-changes" | "block" | "unknown",
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
					},
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
	 * @returns Array of command definitions with plugin source
	 */
	getAllCommands(): { plugin: string; command: ReturnType<NonNullable<Plugin["commands"]>>[number] }[] {
		const commands: { plugin: string; command: ReturnType<NonNullable<Plugin["commands"]>>[number] }[] = [];

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
	 * Gets plugin names and versions.
	 */
	getPluginInfo(): { name: string; version: string }[] {
		return this.plugins.map((p) => ({ name: p.name, version: p.version }));
	}
}

/**
 * Creates a no-op HookManager for when no plugins are loaded.
 *
 * @param logger - Logger instance
 * @returns Empty HookManager
 */
export function createEmptyHookManager(logger: Logger): HookManager {
	return new HookManager([], logger);
}
