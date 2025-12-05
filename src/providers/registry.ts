/**
 * @fileoverview Provider registry for managing multiple LLM backends.
 *
 * This module implements a registry pattern for LLM providers,
 * allowing the CLI to work with any registered provider by name.
 *
 * Choosing the default provider follows this priority:
 * 1. Environment variable: LLM_PROVIDER=claude
 * 2. First available provider that passes health check
 * 3. Ollama (always last resort, most likely to be available locally)
 */

import type { LLMProvider, LLMProviderConstructor, ProviderConfig } from "./types";

/**
 * Environment variable for selecting the default provider.
 */
const LLM_PROVIDER_ENV = "LLM_PROVIDER";

/**
 * A lazy-loaded provider entry.
 */
interface ProviderEntry {
	/** Factory function to create the provider */
	factory: () => LLMProvider;
	/** Cached instance (undefined until first access) */
	instance?: LLMProvider;
}

/**
 * Registry for managing LLM providers.
 *
 * ## Usage
 *
 * ```typescript
 * // Register providers (typically at startup)
 * registry.registerClass("ollama", OllamaProvider);
 * registry.registerClass("claude", ClaudeProvider, { apiKey: process.env.ANTHROPIC_API_KEY });
 *
 * // Get a provider by name
 * const provider = registry.get("claude");
 *
 * // Get the default provider (from env or first available)
 * const defaultProvider = await registry.getDefault();
 *
 * // List all registered providers
 * const names = registry.list(); // ["ollama", "claude", ...]
 * ```
 */
export class ProviderRegistry {
	/** Map of provider name */
	private providers = new Map<string, ProviderEntry>();

	/**
	 * Registers a provider class with optional configuration.
	 *
	 * @param name - Provider identifier (e.g., "claude", "openai")
	 * @param providerClass - The provider class to instantiate
	 * @param config - Optional configuration for the provider
	 */
	registerClass(name: string, providerClass: LLMProviderConstructor, config?: ProviderConfig): void {
		const normalizedName = name.toLowerCase();

		this.providers.set(normalizedName, {
			factory: () => new providerClass(config),
		});
	}

	/**
	 * Registers a pre-created provider instance.
	 *
	 * @param provider - The provider instance to register
	 */
	register(provider: LLMProvider): void {
		const normalizedName = provider.name.toLowerCase();

		this.providers.set(normalizedName, {
			factory: () => provider,
			instance: provider,
		});
	}

	/**
	 * Gets a provider by name, creating it if necessary.
	 *
	 * @param name - Provider identifier (case-insensitive)
	 * @returns The provider instance, or undefined if not registered
	 */
	get(name: string): LLMProvider | undefined {
		const normalizedName = name.toLowerCase();
		const entry = this.providers.get(normalizedName);

		if (!entry) {
			return undefined;
		}

		// Lazy instantiation
		entry.instance ??= entry.factory();

		return entry.instance;
	}

	/**
	 * Gets the default provider based on environment and availability.
	 *
	 * Selection priority:
	 * 1. **Explicit env var**: If LLM_PROVIDER is set, use that
	 * 2. **First healthy provider**: Check each in registration order
	 * 3. **Fallback to first**: If no health checks pass, return first registered
	 *
	 * This ensures the user gets a working provider without configuration,
	 * while still allowing explicit selection.
	 *
	 * @returns Promise resolving to the default provider
	 * @throws Error if no providers are registered
	 */
	async getDefault(): Promise<LLMProvider> {
		if (this.providers.size === 0) {
			throw new Error("No LLM providers registered. Did you forget to register providers?");
		}

		// Check for explicit env var
		const envProvider = process.env[LLM_PROVIDER_ENV];

		if (envProvider) {
			const provider = this.get(envProvider);

			if (provider) {
				return provider;
			}

			console.warn(`Warning: LLM_PROVIDER="${envProvider}" not found. Available: ${this.list().join(", ")}`);
		}

		// Find first healthy provider
		for (const name of this.providers.keys()) {
			const provider = this.get(name);

			if (provider) {
				try {
					const healthy = await provider.checkHealth();

					if (healthy) {
						return provider;
					}
				} catch {
					// Provider health check failed, try next
				}
			}
		}

		// Fall back to first registered provider
		const firstName = this.providers.keys().next().value;

		if (!firstName) {
			throw new Error("No providers registered");
		}

		const fallbackProvider = this.get(firstName);

		if (!fallbackProvider) {
			throw new Error(`Provider ${firstName} not found`);
		}

		return fallbackProvider;
	}

	/**
	 * Lists all registered provider names.
	 *
	 * @returns Array of provider names in registration order
	 */
	list(): string[] {
		return Array.from(this.providers.keys());
	}

	/**
	 * Checks if a provider is registered.
	 *
	 * @param name - Provider identifier (case-insensitive)
	 * @returns True if provider is registered
	 */
	has(name: string): boolean {
		return this.providers.has(name.toLowerCase());
	}

	/**
	 * Removes a provider from the registry.
	 *
	 * @param name - Provider identifier (case-insensitive)
	 * @returns True if provider was removed
	 */
	unregister(name: string): boolean {
		return this.providers.delete(name.toLowerCase());
	}

	/**
	 * Clears all registered providers.
	 */
	clear(): void {
		this.providers.clear();
	}
}

/**
 * Global provider registry instance.
 */
export const providerRegistry = new ProviderRegistry();
