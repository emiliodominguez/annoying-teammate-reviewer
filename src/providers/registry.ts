/**
 * @fileoverview Provider registry for managing multiple LLM backends.
 *
 * This module implements the Service Locator pattern for LLM providers,
 * allowing the CLI to work with any registered provider by name.
 *
 * ## AI Concept: Why a Registry?
 *
 * Without a registry, adding a new provider requires:
 * 1. Import the provider in index.ts
 * 2. Add if/else logic to select it
 * 3. Update help text
 * 4. Repeat for every place that uses providers
 *
 * With a registry:
 * 1. Provider registers itself: `registry.register(new ClaudeProvider())`
 * 2. CLI asks for it: `registry.get("claude")`
 * 3. Done - no changes to CLI code
 *
 * ## AI Concept: Lazy vs Eager Loading
 *
 * We use **lazy loading** for providers:
 * - Provider SDKs (openai, @anthropic-ai/sdk) are only imported when needed
 * - Reduces startup time for users who only use Ollama
 * - Avoids errors if SDK isn't installed for unused providers
 *
 * The tradeoff: First use of a provider has a slight delay for import.
 *
 * ## AI Concept: Default Provider Selection
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
 *
 * ## AI Concept: Lazy Initialization
 *
 * Instead of creating all providers at startup, we store:
 * - A factory function that creates the provider
 * - The created instance (cached after first use)
 *
 * This pattern is called "lazy initialization" or "on-demand creation".
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
 * ## AI Concept: Service Locator Pattern
 *
 * The registry acts as a central lookup service:
 * ```
 * CLI: "I need the claude provider"
 * Registry: *looks up "claude"* → *creates if needed* → returns ClaudeProvider
 * ```
 *
 * This decouples the CLI from specific provider implementations.
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
	/**
	 * Map of provider name → lazy entry.
	 *
	 * Using Map instead of object for:
	 * - Guaranteed iteration order (registration order)
	 * - Better TypeScript typing
	 * - No prototype pollution concerns
	 */
	private providers = new Map<string, ProviderEntry>();

	/**
	 * Registers a provider class with optional configuration.
	 *
	 * ## AI Concept: Factory Registration
	 *
	 * Instead of registering an instance, we register a class + config.
	 * The instance is created lazily on first use. This is important because:
	 * - Cloud SDKs may validate API keys on construction
	 * - We don't want errors for providers the user isn't using
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
	 * Useful for:
	 * - Testing with mock providers
	 * - Providers that need complex initialization
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
	 * ## AI Concept: Lazy Instantiation
	 *
	 * On first access:
	 * 1. Call the factory function to create instance
	 * 2. Cache the instance for future calls
	 * 3. Return the instance
	 *
	 * Subsequent calls return the cached instance directly.
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
	 * ## AI Concept: Smart Default Selection
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
		const firstName = this.providers.keys().next().value!;

		return this.get(firstName)!;
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
	 * Useful for testing or dynamic provider management.
	 *
	 * @param name - Provider identifier (case-insensitive)
	 * @returns True if provider was removed
	 */
	unregister(name: string): boolean {
		return this.providers.delete(name.toLowerCase());
	}

	/**
	 * Clears all registered providers.
	 *
	 * Mainly useful for testing.
	 */
	clear(): void {
		this.providers.clear();
	}
}

/**
 * Global provider registry instance.
 *
 * ## AI Concept: Singleton vs Dependency Injection
 *
 * We use a singleton here for simplicity. In a larger app, you might
 * inject the registry as a dependency. The tradeoff:
 *
 * **Singleton (what we do)**:
 * - Simple to use: `import { providerRegistry } from "./registry"`
 * - Global state (harder to test in isolation)
 *
 * **Dependency Injection**:
 * - More explicit: `function review(registry: ProviderRegistry, ...)`
 * - Better testability (inject mock registry)
 * - More boilerplate
 *
 * For a CLI tool, singleton is fine. For a library, consider DI.
 */
export const providerRegistry = new ProviderRegistry();
