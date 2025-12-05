/**
 * @fileoverview Plugin system types for extending the code reviewer.
 *
 * This module defines the interfaces that plugins must implement to extend
 * the reviewer's functionality.
 *
 * ## AI Concept: Plugin Architecture
 *
 * A plugin system allows users to extend functionality without modifying
 * core code. Key benefits:
 *
 * - **Separation of concerns**: Core logic stays simple, extensions are separate
 * - **User customization**: Each team can add their own rules/outputs
 * - **Community ecosystem**: Others can share plugins
 * - **Experimentation**: Try new features without risk to core
 *
 * ## Plugin Capabilities
 *
 * Plugins can:
 * 1. **Add providers**: Register custom LLM backends
 * 2. **Modify prompts**: Inject custom instructions or context
 * 3. **Process responses**: Transform or analyze LLM output
 * 4. **Add commands**: Extend the CLI with new actions
 * 5. **Change output**: Format results differently (GitHub comments, etc.)
 *
 * ## AI Concept: Hook-Based Architecture
 *
 * Plugins interact with the review pipeline through "hooks" - functions
 * called at specific points in the workflow:
 *
 * ```
 * [User Input]
 *     ↓
 * beforePrompt ← Hook: plugins can modify the prompt
 *     ↓
 * [LLM Call]
 *     ↓
 * afterResponse ← Hook: plugins can process the response
 *     ↓
 * beforeVerdict ← Hook: plugins can modify verdict extraction
 *     ↓
 * [Output]
 * ```
 *
 * This is similar to how webpack plugins, babel plugins, and
 * many other tools work.
 */

import type { LLMProvider } from "../providers/types";

/**
 * Context passed to hooks about the review context.
 */
export interface ReviewContext {
	/** What's being reviewed (e.g., "staged changes", "branch comparison") */
	mode: string;
	/** Current branch name */
	branch: string;
	/** Number of files changed */
	fileCount: number;
	/** Commit messages (if reviewing branch) */
	commits?: string;
	/** List of changed file paths */
	files?: string[];
}

/**
 * Context for the beforePrompt hook.
 *
 * ## AI Concept: Prompt Modification
 *
 * This hook allows plugins to:
 * - Add custom instructions to the prompt
 * - Inject project-specific context
 * - Modify the diff before sending
 * - Add security scanning results
 *
 * Example use case: A plugin that adds ESLint rules to the prompt
 * so the AI can check for consistency with project standards.
 */
export interface BeforePromptContext {
	/** The diff to be reviewed */
	diff: string;
	/** Review context (mode, branch, files) */
	reviewContext: ReviewContext;
	/** The base prompt (can be modified) */
	prompt: string;
	/** Add text to the prompt */
	addToPrompt(text: string): void;
	/** Replace the entire prompt */
	setPrompt(prompt: string): void;
}

/**
 * Context for the afterResponse hook.
 *
 * ## AI Concept: Response Processing
 *
 * This hook allows plugins to:
 * - Analyze the LLM response
 * - Extract additional information
 * - Post results to external services
 * - Log metrics about the review
 *
 * Example use case: A plugin that posts review comments
 * to GitHub PR as inline comments.
 */
export interface AfterResponseContext {
	/** The raw LLM response */
	response: string;
	/** Review context */
	reviewContext: ReviewContext;
	/** The model used for generation */
	model: string;
	/** The provider used */
	providerName: string;
	/** Modify the response */
	setResponse(response: string): void;
}

/**
 * Context for the beforeVerdict hook.
 *
 * ## AI Concept: Verdict Customization
 *
 * This hook allows plugins to:
 * - Override the verdict extraction logic
 * - Add custom verdict types
 * - Apply team-specific approval rules
 *
 * Example use case: A plugin that always blocks if
 * certain security patterns are mentioned in the review.
 */
export interface BeforeVerdictContext {
	/** The LLM response */
	response: string;
	/** Current extracted verdict */
	verdict: "approve" | "request-changes" | "block" | "unknown";
	/** Override the verdict */
	setVerdict(verdict: "approve" | "request-changes" | "block" | "unknown"): void;
}

/**
 * Command definition for plugins that add CLI commands.
 *
 * ## AI Concept: CLI Extensibility
 *
 * Plugins can add new commands to the CLI:
 * ```bash
 * npm run review -- --plugin my-plugin fix-issues
 * ```
 *
 * This enables plugins to add functionality like:
 * - Auto-fix suggestions
 * - Generate documentation
 * - Create test cases
 */
export interface CommandDefinition {
	/** Command name (e.g., "fix-issues") */
	name: string;
	/** Description for --help */
	description: string;
	/** Options/flags for the command */
	options?: {
		flags: string;
		description: string;
		defaultValue?: string | boolean | number;
	}[];
	/** Handler function for the command */
	handler(args: Record<string, unknown>): Promise<void>;
}

/**
 * Logger interface for plugins.
 *
 * Plugins should use this instead of console.log for
 * consistent output formatting and respecting quiet mode.
 */
export interface Logger {
	info(message: string): void;
	warn(message: string): void;
	error(message: string): void;
	debug(message: string): void;
}

/**
 * Context passed to plugin initialization.
 *
 * ## AI Concept: Plugin Initialization
 *
 * When a plugin is loaded, it receives this context which provides:
 * - Configuration values
 * - Logging utilities
 * - Access to register providers
 *
 * The plugin can use this to set up any resources it needs.
 */
export interface PluginContext {
	/** Current configuration */
	config: {
		providerName: string;
		model: string;
		isQuiet: boolean;
		isJson: boolean;
	};
	/** Logger for plugin output */
	logger: Logger;
	/** Register a custom LLM provider */
	registerProvider(provider: LLMProvider): void;
}

/**
 * The main plugin interface that all plugins must implement.
 *
 * ## AI Concept: Plugin Contract
 *
 * This interface defines the "contract" between the core and plugins.
 * Plugins must provide at least a name and version. All hooks are optional.
 *
 * ## Creating a Plugin
 *
 * ```typescript
 * // my-plugin.ts
 * import type { Plugin } from 'annoying-teammate-reviewer';
 *
 * const myPlugin: Plugin = {
 *   name: 'my-awesome-plugin',
 *   version: '1.0.0',
 *
 *   async init(context) {
 *     context.logger.info('Plugin initialized!');
 *   },
 *
 *   async beforePrompt(context) {
 *     context.addToPrompt('\n\nAlso check for XSS vulnerabilities.');
 *   }
 * };
 *
 * export default myPlugin;
 * ```
 *
 * ## Plugin Distribution
 *
 * Plugins can be distributed as:
 * - npm packages: `npm install annoying-reviewer-plugin-security`
 * - Local files: `--plugin ./my-plugin.js`
 * - Git repos: In project's `.annoying-reviewer/plugins/` directory
 */
export interface Plugin {
	/**
	 * Unique plugin name.
	 *
	 * Use a descriptive, kebab-case name like:
	 * - "security-scanner"
	 * - "github-comments"
	 * - "eslint-rules"
	 */
	name: string;

	/**
	 * Plugin version (semver recommended).
	 */
	version: string;

	/**
	 * Optional description shown in plugin list.
	 */
	description?: string;

	/**
	 * Initialize the plugin.
	 *
	 * Called once when the plugin is loaded, before any review runs.
	 * Use this to:
	 * - Set up resources
	 * - Validate configuration
	 * - Register custom providers
	 *
	 * @param context - Plugin context with config and utilities
	 */
	init?(context: PluginContext): Promise<void>;

	/**
	 * Called before the prompt is sent to the LLM.
	 *
	 * Use this to modify the prompt, add context, or inject instructions.
	 *
	 * @param context - Context with prompt and modification methods
	 */
	beforePrompt?(context: BeforePromptContext): Promise<void>;

	/**
	 * Called after receiving the LLM response.
	 *
	 * Use this to process, analyze, or transform the response.
	 *
	 * @param context - Context with response and modification methods
	 */
	afterResponse?(context: AfterResponseContext): Promise<void>;

	/**
	 * Called before extracting the verdict from the response.
	 *
	 * Use this to customize verdict extraction or override verdicts.
	 *
	 * @param context - Context with verdict and override method
	 */
	beforeVerdict?(context: BeforeVerdictContext): Promise<void>;

	/**
	 * Register custom CLI commands.
	 *
	 * Return an array of command definitions to add to the CLI.
	 */
	commands?(): CommandDefinition[];

	/**
	 * Register custom LLM providers.
	 *
	 * Return an array of provider instances to make available.
	 */
	providers?(): LLMProvider[];
}
