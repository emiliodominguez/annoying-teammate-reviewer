/**
 * @fileoverview Anthropic Claude provider for cloud-based LLM inference.
 *
 * This module wraps the Anthropic API in the LLMProvider interface, enabling
 * the reviewer to use Claude's powerful models for code review.
 *
 * ## What is Claude?
 *
 * Claude is Anthropic's family of AI assistants, known for:
 * - **Strong reasoning**: Excellent at code analysis and complex tasks
 * - **Long context**: Up to 200K tokens (massive codebases fit easily)
 * - **Safety focus**: Designed to be helpful, harmless, and honest
 * - **Instruction following**: Very good at following specific output formats
 *
 * ## AI Concept: Claude vs Other Providers
 *
 * | Aspect          | Claude                 | GPT-4              | Gemini           |
 * |-----------------|------------------------|--------------------| -----------------|
 * | Context window  | 200K tokens            | 128K tokens        | 1M tokens        |
 * | Strengths       | Reasoning, safety      | General knowledge  | Speed, multimodal|
 * | Cost            | $$ (per token)         | $$ (per token)     | $ (cheaper)      |
 * | Code review     | Excellent              | Excellent          | Very good        |
 *
 * ## AI Concept: System Prompts in Claude
 *
 * Unlike Ollama (where everything goes in one prompt), Claude has a
 * dedicated `system` parameter for instructions. This creates stronger
 * adherence to the reviewer persona and rules.
 *
 * ```typescript
 * // Ollama: Everything concatenated
 * prompt = personality + instructions + diff
 *
 * // Claude: Separated roles
 * system = personality + instructions
 * user = diff
 * ```
 *
 * This separation helps Claude understand what are instructions vs content.
 *
 * ## AI Concept: Server-Sent Events (SSE)
 *
 * Claude uses SSE for streaming (not NDJSON like Ollama).
 * SSE is a standard web protocol for server-to-client streaming:
 * ```
 * event: content_block_delta
 * data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}
 *
 * event: content_block_delta
 * data: {"type":"content_block_delta","delta":{"type":"text_delta","text":" world"}}
 * ```
 *
 * The Anthropic SDK handles SSE parsing for us.
 *
 * @see https://docs.anthropic.com/claude/reference/messages_post
 */

import type { GenerateOptions, LLMProvider, ProviderConfig } from "./types";

/**
 * Default model for Claude.
 *
 * ## AI Concept: Claude Model Selection
 *
 * Claude has several model tiers:
 * - **claude-3-5-sonnet**: Best balance of speed, quality, and cost
 * - **claude-3-opus**: Highest quality, slower, more expensive
 * - **claude-3-haiku**: Fastest, cheapest, good for simple tasks
 *
 * For code review, Sonnet is ideal:
 * - Good enough reasoning for code analysis
 * - Fast enough for interactive use
 * - Cost-effective for frequent reviews
 */
const DEFAULT_MODEL = "claude-sonnet-4-20250514";

/**
 * Anthropic API types.
 *
 * We define these locally to avoid requiring @anthropic-ai/sdk at compile time.
 * The actual SDK is lazy-loaded at runtime only when Claude is used.
 */
interface AnthropicMessage {
	role: "user" | "assistant";
	content: string;
}

interface AnthropicStreamEvent {
	type: string;
	delta?: {
		type: string;
		text?: string;
	};
}

interface AnthropicClient {
	messages: {
		create(options: {
			model: string;
			max_tokens: number;
			system?: string;
			messages: AnthropicMessage[];
			stream?: boolean;
		}): Promise<AsyncIterable<AnthropicStreamEvent>>;
	};
}

/**
 * Claude LLM provider using Anthropic's API.
 *
 * ## AI Concept: Lazy SDK Loading
 *
 * The Anthropic SDK is only loaded when actually needed:
 * 1. Provider is registered at startup (no import yet)
 * 2. User selects --provider claude
 * 3. First streamResponse call loads the SDK
 *
 * Benefits:
 * - No error if @anthropic-ai/sdk isn't installed (for Ollama-only users)
 * - Faster startup (don't load unused SDKs)
 * - Smaller memory footprint
 *
 * ## Usage
 *
 * ```typescript
 * const claude = new ClaudeProvider({ apiKey: process.env.ANTHROPIC_API_KEY });
 *
 * // Check if API key is valid
 * const healthy = await claude.checkHealth();
 *
 * // Generate a review
 * const review = await claude.streamResponse(
 *   prompt,
 *   (chunk) => process.stdout.write(chunk)
 * );
 * ```
 */
export class ClaudeProvider implements LLMProvider {
	/** Provider identifier used for CLI selection. */
	readonly name = "claude";

	/** Human-readable provider name for display. */
	readonly displayName = "Claude";

	/** Anthropic API key for authentication. */
	private apiKey: string | undefined;

	/** Default model to use when none specified. */
	private defaultModel: string;

	/** Cached Anthropic client instance. */
	private client: AnthropicClient | null = null;

	/**
	 * Creates a new Claude provider.
	 *
	 * @param config - Provider configuration (API key required)
	 */
	constructor(config?: ProviderConfig) {
		this.apiKey = config?.apiKey ?? process.env.ANTHROPIC_API_KEY;
		this.defaultModel = config?.defaultModel ?? process.env.CLAUDE_DEFAULT_MODEL ?? DEFAULT_MODEL;
	}

	/**
	 * Checks if Claude is available (API key is set and valid).
	 *
	 * ## AI Concept: API Key Validation
	 *
	 * For cloud providers, "health" means:
	 * 1. API key is configured
	 * 2. API key is valid (optional - could make a test call)
	 *
	 * We only check if key exists here. Invalid keys will fail
	 * at generation time with a clear error message.
	 */
	checkHealth(): Promise<boolean> {
		// Basic check: is the API key configured?
		if (!this.apiKey) {
			return Promise.resolve(false);
		}

		// Optionally: make a lightweight API call to verify the key
		// For now, we trust that if the key is set, it's probably valid
		return Promise.resolve(true);
	}

	/**
	 * Gets available Claude models.
	 *
	 * ## AI Concept: Model Enumeration
	 *
	 * Unlike Ollama (where you download specific models), Claude
	 * models are cloud-hosted. You have access to all models your
	 * API key is authorized for.
	 *
	 * We return a static list of current models. In production,
	 * you might query the API for available models.
	 */
	getAvailableModels(): Promise<string[]> {
		// Claude models are cloud-hosted, so we return the known models
		// Your API key may or may not have access to all of these
		return Promise.resolve(["claude-sonnet-4-20250514", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"]);
	}

	/**
	 * Checks if a model is available.
	 *
	 * For Claude, we check against our known model list.
	 */
	async isModelAvailable(modelName: string): Promise<boolean> {
		const models = await this.getAvailableModels();

		return models.some((model) => model.includes(modelName) || modelName.includes(model));
	}

	/**
	 * Streams a response from Claude.
	 *
	 * ## AI Concept: Claude Streaming with SSE
	 *
	 * Claude's streaming uses Server-Sent Events with typed events:
	 * - `message_start`: Initial message metadata
	 * - `content_block_start`: Start of a content block
	 * - `content_block_delta`: Incremental text content
	 * - `content_block_stop`: End of content block
	 * - `message_stop`: End of message
	 *
	 * The Anthropic SDK wraps this in an async iterator, making
	 * consumption simple.
	 *
	 * ## AI Concept: System Prompt Separation
	 *
	 * Claude separates system instructions from user content:
	 * ```
	 * system: "You are Emi, a code reviewer..."
	 * user: "Review this diff: ..."
	 * ```
	 *
	 * This helps Claude understand the difference between:
	 * - Instructions (how to behave)
	 * - Content (what to process)
	 */
	async streamResponse(prompt: string, onChunk: (chunk: string) => void, options?: GenerateOptions): Promise<string> {
		const client = await this.getClient();
		const model = options?.model ?? this.defaultModel;

		// Claude has a separate system parameter, but for simplicity
		// we'll use the combined prompt approach (works fine)
		const stream = await client.messages.create({
			model,
			max_tokens: options?.maxTokens ?? 2048,
			messages: [{ role: "user", content: prompt }],
			stream: true,
		});

		let fullResponse = "";

		for await (const event of stream) {
			if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
				fullResponse += event.delta.text;
				onChunk(event.delta.text);
			}
		}

		return fullResponse;
	}

	/**
	 * Gets the default model for Claude.
	 */
	getDefaultModel(): string {
		return this.defaultModel;
	}

	/**
	 * Lazily loads the Anthropic SDK.
	 *
	 * ## AI Concept: Dynamic Imports
	 *
	 * Using dynamic import() instead of static import:
	 * - Static: `import Anthropic from '@anthropic-ai/sdk'` - loads at startup
	 * - Dynamic: `await import('@anthropic-ai/sdk')` - loads on demand
	 *
	 * This is crucial for optional dependencies - users who don't want
	 * Claude don't need to install the SDK.
	 */
	private async getClient(): Promise<AnthropicClient> {
		if (this.client) {
			return this.client;
		}

		if (!this.apiKey) {
			throw new Error("ANTHROPIC_API_KEY environment variable is required for Claude provider");
		}

		try {
			// Dynamic import - only loads when actually needed
			const { default: Anthropic } = await import("@anthropic-ai/sdk");

			this.client = new Anthropic({ apiKey: this.apiKey }) as unknown as AnthropicClient;

			return this.client;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND") {
				throw new Error(
					"@anthropic-ai/sdk is not installed. Run: npm install @anthropic-ai/sdk\n" + "Or use a different provider: --provider ollama",
				);
			}

			throw error;
		}
	}
}
