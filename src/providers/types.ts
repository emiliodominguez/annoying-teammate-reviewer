/**
 * @fileoverview Provider abstraction layer for multi-LLM support.
 *
 * This module defines the interface that all LLM providers must implement,
 * enabling the reviewer to work with any LLM backend.
 *
 * ## AI Concept: Provider Abstraction Pattern
 *
 * Different LLM providers have different APIs, but they all do the same thing:
 * take text in, produce text out. By defining a common interface, we can:
 *
 * 1. **Swap providers easily**: Change `--provider claude` to `--provider openai`
 * 2. **Test with mocks**: Create a `MockProvider` for testing without real API calls
 * 3. **Add new providers**: Implement the interface, register it, done
 *
 * ## AI Concept: Why Each Method Exists
 *
 * ```
 * checkHealth()      → "Is the provider available?" (Ollama running? API key valid?)
 * getAvailableModels() → "What models can I use?" (varies by provider)
 * isModelAvailable() → "Can I use this specific model?" (downloaded? access granted?)
 * streamResponse()   → "Generate text with streaming" (main inference method)
 * getDefaultModel()  → "What model if none specified?" (provider's recommendation)
 * ```
 *
 * ## AI Concept: Provider Differences
 *
 * | Provider | Auth          | Streaming    | System Prompt | Context  |
 * |----------|---------------|--------------|---------------|----------|
 * | Ollama   | None (local)  | NDJSON       | In prompt     | 4K-32K   |
 * | Claude   | API Key       | SSE          | Separate      | 200K     |
 * | OpenAI   | API Key       | SSE          | Separate      | 128K     |
 * | Gemini   | API Key       | SSE          | Separate      | 1M       |
 *
 * Each provider adapter handles these differences internally.
 */

/**
 * Options for text generation across all providers.
 *
 * ## AI Concept: Universal Parameters
 *
 * Despite different APIs, all LLMs share these core parameters:
 * - **model**: Which model to use
 * - **temperature**: Creativity/randomness control (0=deterministic, 1=creative)
 * - **maxTokens**: Output length limit
 *
 * Provider-specific options (like top_p, frequency_penalty) are handled
 * internally by each provider adapter.
 */
export interface GenerateOptions {
	/**
	 * Which model to use for generation.
	 *
	 * Examples:
	 * - Ollama: "llama3.2", "codellama:7b", "mistral"
	 * - Claude: "claude-3-5-sonnet-20241022", "claude-3-haiku-20240307"
	 * - OpenAI: "gpt-4-turbo", "gpt-3.5-turbo"
	 * - Gemini: "gemini-1.5-pro", "gemini-1.5-flash"
	 */
	model?: string;

	/**
	 * Controls randomness in generation (0.0 to 1.0+).
	 *
	 * ## AI Concept: Temperature
	 *
	 * Temperature affects the probability distribution over next tokens:
	 * - **0.0**: Always pick most likely token (deterministic, may be repetitive)
	 * - **0.3-0.5**: Low creativity, focused and consistent
	 * - **0.7**: Balanced (our default for code review)
	 * - **1.0**: High creativity, more varied output
	 * - **>1.0**: Very random, may become incoherent
	 *
	 * For code review, 0.7 provides personality without hallucination risk.
	 *
	 * @defaultValue 0.7
	 */
	temperature?: number;

	/**
	 * Maximum tokens to generate in the response.
	 *
	 * ## AI Concept: Token Budgeting
	 *
	 * Setting maxTokens prevents:
	 * - Runaway generation (model keeps talking forever)
	 * - Unexpected costs (cloud APIs charge per token)
	 * - Context overflow (output counts against context limit)
	 *
	 * For code review, 2048 tokens (~1500 words) is plenty.
	 *
	 * @defaultValue 2048
	 */
	maxTokens?: number;
}

/**
 * Configuration for initializing a provider.
 *
 * ## AI Concept: Provider Configuration
 *
 * Each provider needs different setup:
 * - **Ollama**: Just baseUrl (defaults to localhost:11434)
 * - **Cloud providers**: API key required, baseUrl optional for proxies
 * - **All**: Can override default model
 */
export interface ProviderConfig {
	/**
	 * API key for authentication (cloud providers).
	 *
	 * ## AI Concept: API Key Security
	 *
	 * NEVER hardcode API keys. Use environment variables:
	 * - ANTHROPIC_API_KEY for Claude
	 * - OPENAI_API_KEY for OpenAI
	 * - GOOGLE_AI_API_KEY for Gemini
	 *
	 * Local providers (Ollama) don't need keys.
	 */
	apiKey?: string;

	/**
	 * Custom base URL for the API.
	 *
	 * Use cases:
	 * - Ollama on different port/host
	 * - Azure OpenAI endpoints
	 * - API proxies for logging/rate limiting
	 */
	baseUrl?: string;

	/**
	 * Override the provider's default model.
	 */
	defaultModel?: string;
}

/**
 * The core interface that all LLM providers must implement.
 *
 * ## AI Concept: Interface Design for LLMs
 *
 * This interface captures the essential operations for any LLM:
 *
 * 1. **Health/Availability** - Can we use this provider right now?
 * 2. **Model Discovery** - What models are available?
 * 3. **Inference** - Generate text from a prompt
 *
 * By coding against this interface (not concrete providers), the CLI
 * doesn't care whether it's talking to a local Ollama or cloud Claude.
 *
 * ## AI Concept: Streaming as Default
 *
 * Notice we only have `streamResponse`, not `generateComplete`.
 * Streaming is the preferred method because:
 * - Better UX (user sees progress immediately)
 * - Can cancel early if response is wrong
 * - Same result as batch, just delivered incrementally
 *
 * If a provider doesn't support streaming, its adapter can fake it
 * by calling the batch API and invoking the callback once at the end.
 */
export interface LLMProvider {
	/**
	 * Unique identifier for this provider.
	 *
	 * Used in:
	 * - CLI: `--provider ollama`
	 * - Env: `LLM_PROVIDER=ollama`
	 * - Registry lookups
	 *
	 * Must be lowercase, no spaces (e.g., "ollama", "claude", "openai", "gemini").
	 */
	readonly name: string;

	/**
	 * Human-readable display name.
	 *
	 * Used in UI messages like "Reviewing with Claude..."
	 */
	readonly displayName: string;

	/**
	 * Checks if the provider is available and properly configured.
	 *
	 * ## AI Concept: Health Checks
	 *
	 * Before using a provider, we should verify:
	 * - Local (Ollama): Is the server running?
	 * - Cloud: Is the API key valid? Is the service up?
	 *
	 * This prevents cryptic errors mid-review.
	 *
	 * @returns Promise resolving to true if provider is ready
	 */
	checkHealth(): Promise<boolean>;

	/**
	 * Gets the list of models available through this provider.
	 *
	 * ## AI Concept: Model Discovery
	 *
	 * Available models vary by provider:
	 * - Ollama: Only locally downloaded models
	 * - Claude: All models your API key has access to
	 * - OpenAI: Depends on your tier (GPT-4 requires paid tier)
	 *
	 * @returns Promise resolving to array of model identifiers
	 */
	getAvailableModels(): Promise<string[]>;

	/**
	 * Checks if a specific model is available.
	 *
	 * ## AI Concept: Model Validation
	 *
	 * Before starting a review, verify the requested model exists.
	 * Supports partial matching (e.g., "llama3.2" matches "llama3.2:latest").
	 *
	 * @param modelName - Model identifier to check
	 * @returns Promise resolving to true if model is available
	 */
	isModelAvailable(modelName: string): Promise<boolean>;

	/**
	 * Generates a response with streaming.
	 *
	 * ## AI Concept: Streaming Generation
	 *
	 * This is the main inference method. It:
	 * 1. Sends the prompt to the LLM
	 * 2. Calls `onChunk` for each piece of generated text
	 * 3. Returns the complete response when done
	 *
	 * The `onChunk` callback enables real-time display:
	 * ```
	 * onChunk = (text) => process.stdout.write(text)
	 * ```
	 *
	 * ## AI Concept: Prompt Handling
	 *
	 * The `prompt` parameter is the complete prompt including:
	 * - System instructions (personality, rules)
	 * - User content (the diff to review)
	 *
	 * For providers with separate system prompts (Claude, OpenAI),
	 * the adapter may split this internally.
	 *
	 * @param prompt - The complete prompt to send
	 * @param onChunk - Callback invoked with each piece of generated text
	 * @param options - Generation options (model, temperature, maxTokens)
	 * @returns Promise resolving to the complete generated text
	 */
	streamResponse(prompt: string, onChunk: (chunk: string) => void, options?: GenerateOptions): Promise<string>;

	/**
	 * Gets this provider's default model.
	 *
	 * ## AI Concept: Default Model Selection
	 *
	 * Each provider has a sensible default:
	 * - Ollama: "llama3.2" (good balance of speed/quality)
	 * - Claude: "claude-3-5-sonnet-20241022" (best value)
	 * - OpenAI: "gpt-4-turbo" (best quality/cost ratio)
	 * - Gemini: "gemini-1.5-flash" (fast and capable)
	 *
	 * Users can override via --model flag or env vars.
	 *
	 * @returns The default model identifier for this provider
	 */
	getDefaultModel(): string;
}

/**
 * Constructor signature for provider classes.
 *
 * ## AI Concept: Provider Factory Pattern
 *
 * Providers are created with optional configuration:
 * ```typescript
 * const ollama = new OllamaProvider(); // Uses defaults
 * const claude = new ClaudeProvider({ apiKey: process.env.ANTHROPIC_API_KEY });
 * ```
 *
 * This allows lazy initialization - we only create the provider
 * when the user actually selects it.
 */
export type LLMProviderConstructor = new (config?: ProviderConfig) => LLMProvider;
