/**
 * @fileoverview Plugin discovery and loading for the code reviewer.
 *
 * This module handles finding, loading, and initializing plugins.
 *
 * ## AI Concept: Plugin Discovery
 *
 * Plugins can be discovered from multiple sources:
 *
 * 1. **CLI flag**: `--plugin ./my-plugin.js`
 *    - Explicit path to a plugin file
 *    - Good for development and one-off plugins
 *
 * 2. **Local directory**: `.annoying-reviewer/plugins/`
 *    - Project-specific plugins
 *    - Checked into version control
 *
 * 3. **npm packages**: `annoying-reviewer-plugin-*`
 *    - Distributed via npm
 *    - Installed as dependencies
 *
 * ## AI Concept: Plugin Loading Order
 *
 * Loading order matters because plugins can depend on each other:
 * 1. Built-in plugins (if any)
 * 2. npm package plugins (alphabetical)
 * 3. Local directory plugins (alphabetical)
 * 4. CLI-specified plugins (in order specified)
 *
 * ## AI Concept: Plugin Isolation
 *
 * Each plugin runs in the same Node.js process (no sandboxing).
 * This means plugins can:
 * - Access the filesystem
 * - Make network requests
 * - Modify global state (bad practice!)
 *
 * For security, only use trusted plugins. Future versions might
 * add sandboxing for untrusted plugins.
 */

import { existsSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { pathToFileURL } from "url";

import type { Plugin, PluginContext } from "./types";

/**
 * Result of plugin loading.
 */
export interface LoadedPlugin {
	/** The plugin instance */
	plugin: Plugin;
	/** Where the plugin was loaded from */
	source: "cli" | "local" | "npm";
	/** Path or package name */
	location: string;
}

/**
 * Loads a plugin from a file path.
 *
 * ## AI Concept: Dynamic ESM Import
 *
 * We use dynamic import() for plugin loading:
 * - Works with both ES modules and CommonJS
 * - Allows plugins to be loaded at runtime
 * - Supports TypeScript plugins (if ts-node is present)
 *
 * @param pluginPath - Path to the plugin file
 * @returns The loaded plugin
 */
async function loadPluginFromPath(pluginPath: string): Promise<Plugin> {
	const absolutePath = resolve(process.cwd(), pluginPath);

	if (!existsSync(absolutePath)) {
		throw new Error("Plugin not found: " + absolutePath);
	}

	// Convert to file URL for ESM compatibility
	const fileUrl = pathToFileURL(absolutePath).href;

	try {
		const module = await import(fileUrl);
		const plugin = module.default || module;

		validatePlugin(plugin, pluginPath);

		return plugin;
	} catch (error) {
		throw new Error("Failed to load plugin from " + pluginPath + ": " + (error as Error).message);
	}
}

/**
 * Loads a plugin from an npm package.
 *
 * ## AI Concept: npm Package Discovery
 *
 * npm packages are loaded using the standard import mechanism.
 * The package must:
 * - Be installed in node_modules
 * - Export a default plugin or a plugin named export
 *
 * @param packageName - npm package name
 * @returns The loaded plugin
 */
async function loadPluginFromPackage(packageName: string): Promise<Plugin> {
	try {
		const module = await import(packageName);
		const plugin = module.default || module;

		validatePlugin(plugin, packageName);

		return plugin;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND") {
			throw new Error("Plugin package not found: " + packageName + ". Run: npm install " + packageName);
		}

		throw new Error("Failed to load plugin from " + packageName + ": " + (error as Error).message);
	}
}

/**
 * Validates that an object is a valid plugin.
 *
 * ## AI Concept: Runtime Type Checking
 *
 * Since plugins are loaded dynamically, we can't rely on TypeScript
 * for type checking. We validate at runtime that the plugin has
 * the required properties.
 *
 * @param plugin - Object to validate
 * @param source - Source for error messages
 */
function validatePlugin(plugin: unknown, source: string): asserts plugin is Plugin {
	if (!plugin || typeof plugin !== "object") {
		throw new Error("Plugin from " + source + " is not an object");
	}

	const p = plugin as Record<string, unknown>;

	if (typeof p.name !== "string" || p.name.length === 0) {
		throw new Error("Plugin from " + source + " missing required 'name' property");
	}

	if (typeof p.version !== "string" || p.version.length === 0) {
		throw new Error("Plugin from " + source + " missing required 'version' property");
	}

	// Validate optional hooks are functions if present
	const hooks = ["init", "beforePrompt", "afterResponse", "beforeVerdict", "commands", "providers"];

	for (const hook of hooks) {
		if (p[hook] !== undefined && typeof p[hook] !== "function") {
			throw new Error("Plugin " + p.name + ": '" + hook + "' must be a function");
		}
	}
}

/**
 * Discovers plugins from the local .annoying-reviewer/plugins directory.
 *
 * @returns Array of plugin file paths
 */
function discoverLocalPlugins(): string[] {
	const pluginDir = resolve(process.cwd(), ".annoying-reviewer", "plugins");

	if (!existsSync(pluginDir)) {
		return [];
	}

	const files = readdirSync(pluginDir);

	return files.filter((file) => file.endsWith(".js") || file.endsWith(".mjs") || file.endsWith(".ts")).map((file) => join(pluginDir, file));
}

/**
 * Discovers plugins from npm packages.
 *
 * ## AI Concept: Package.json Scanning
 *
 * We look for installed packages that start with:
 * - `annoying-reviewer-plugin-`
 * - `@* /annoying-reviewer-plugin-` (scoped packages)
 *
 * @returns Array of package names
 */
function discoverNpmPlugins(): string[] {
	const packageJsonPath = resolve(process.cwd(), "package.json");

	if (!existsSync(packageJsonPath)) {
		return [];
	}

	try {
		const packageJson = require(packageJsonPath);
		const allDeps = {
			...packageJson.dependencies,
			...packageJson.devDependencies
		};

		return Object.keys(allDeps).filter((name) => name.startsWith("annoying-reviewer-plugin-") || name.includes("/annoying-reviewer-plugin-"));
	} catch {
		return [];
	}
}

/**
 * Loads all discovered plugins.
 *
 * ## AI Concept: Plugin Loading Pipeline
 *
 * 1. Discover plugins from all sources
 * 2. Load each plugin (dynamic import)
 * 3. Validate plugin structure
 * 4. Return loaded plugins with metadata
 *
 * @param cliPlugins - Plugin paths specified via CLI
 * @returns Array of loaded plugins
 */
export async function loadPlugins(cliPlugins: string[] = []): Promise<LoadedPlugin[]> {
	const loadedPlugins: LoadedPlugin[] = [];
	const loadedNames = new Set<string>();

	// Load npm plugins first
	const npmPlugins = discoverNpmPlugins();

	for (const packageName of npmPlugins) {
		try {
			const plugin = await loadPluginFromPackage(packageName);

			if (loadedNames.has(plugin.name)) {
				console.warn("Warning: Plugin '" + plugin.name + "' already loaded, skipping " + packageName);

				continue;
			}

			loadedNames.add(plugin.name);
			loadedPlugins.push({
				plugin,
				source: "npm",
				location: packageName
			});
		} catch (error) {
			console.warn("Warning: Failed to load npm plugin " + packageName + ": " + (error as Error).message);
		}
	}

	// Load local plugins
	const localPlugins = discoverLocalPlugins();

	for (const pluginPath of localPlugins) {
		try {
			const plugin = await loadPluginFromPath(pluginPath);

			if (loadedNames.has(plugin.name)) {
				console.warn("Warning: Plugin '" + plugin.name + "' already loaded, skipping " + pluginPath);

				continue;
			}

			loadedNames.add(plugin.name);
			loadedPlugins.push({
				plugin,
				source: "local",
				location: pluginPath
			});
		} catch (error) {
			console.warn("Warning: Failed to load local plugin " + pluginPath + ": " + (error as Error).message);
		}
	}

	// Load CLI-specified plugins last (highest priority)
	for (const pluginPath of cliPlugins) {
		try {
			const plugin = await loadPluginFromPath(pluginPath);

			if (loadedNames.has(plugin.name)) {
				console.warn("Warning: Plugin '" + plugin.name + "' already loaded, replacing with CLI version");
				// Remove the previous version
				const index = loadedPlugins.findIndex((p) => p.plugin.name === plugin.name);

				if (index !== -1) {
					loadedPlugins.splice(index, 1);
				}
			}

			loadedNames.add(plugin.name);
			loadedPlugins.push({
				plugin,
				source: "cli",
				location: pluginPath
			});
		} catch (error) {
			// CLI plugins are explicit, so throw on error
			throw new Error("Failed to load plugin " + pluginPath + ": " + (error as Error).message);
		}
	}

	return loadedPlugins;
}

/**
 * Initializes all loaded plugins.
 *
 * ## AI Concept: Plugin Lifecycle
 *
 * Plugins go through a lifecycle:
 * 1. **Load**: Import the plugin module
 * 2. **Validate**: Check it has required properties
 * 3. **Initialize**: Call init() with context
 * 4. **Use**: Call hooks during review
 *
 * @param plugins - Loaded plugins to initialize
 * @param context - Plugin context
 */
export async function initializePlugins(plugins: LoadedPlugin[], context: PluginContext): Promise<void> {
	for (const { plugin, source, location } of plugins) {
		try {
			if (plugin.init) {
				await plugin.init(context);
			}

			// Register any providers the plugin provides
			if (plugin.providers) {
				const providers = plugin.providers();

				for (const provider of providers) {
					context.registerProvider(provider);
				}
			}

			context.logger.debug("Loaded plugin: " + plugin.name + " v" + plugin.version + " from " + source + " (" + location + ")");
		} catch (error) {
			throw new Error("Failed to initialize plugin " + plugin.name + ": " + (error as Error).message);
		}
	}
}
