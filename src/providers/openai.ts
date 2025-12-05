/**
 * @fileoverview OpenAI provider for cloud-based LLM inference.
 *
 * This module wraps the OpenAI API in the LLMProvider interface, enabling
 * the reviewer to use GPT models for code review.
 *
 * ## What is OpenAI/GPT?
 *
 * OpenAI's GPT models are widely used language models known for:
 * - **Broad knowledge**: Trained on massive internet data
 * - **Good code understanding**: Strong programming capabilities
 * - **Function calling**: Native support for structured outputs
 * - **Wide ecosystem**: Most tools support OpenAI first
 *
 * ## AI Concept: GPT Model Tiers (2025)
 *
 * OpenAI offers different model families:
 * - **GPT-4.1**: Best for coding & long-context, 1M token window (Apr 2025)
 * - **GPT-4.1 mini/nano**: Cheaper variants of 4.1
 * - **GPT-4o/GPT-4o-mini**: Multimodal flagship models
 * - **o3/o4-mini**: Reasoning models for math, science, coding
 *
 * Note: GPT-4.5 Preview deprecated July 2025.
 *
 * For code review, GPT-4.1 is recommended for its strong coding
 * performance and massive 1M token context window.
 *
 * @see https://platform.openai.com/docs/models
 *
 * ## AI Concept: Chat Completions API
 *
 * OpenAI uses a "chat completions" format with message roles:
 * ```typescript
 * messages: [
 *   { role: "system", content: "You are a code reviewer..." },
 *   { role: "user", content: "Review this diff..." },
 *   { role: "assistant", content: "..." }, // Previous response
 *   { role: "user", content: "..." } // Follow-up
 * ]
 * ```
 *
 * The system message sets the AI's behavior, while user/assistant
 * messages form the conversation history.
 *
 * ## AI Concept: SSE Streaming (Same as Claude)
 *
 * OpenAI also uses Server-Sent Events for streaming:
 * ```
 * data: {"choices":[{"delta":{"content":"Hello"}}]}
 * data: {"choices":[{"delta":{"content":" world"}}]}
 * data: [DONE]
 * ```
 *
 * @see https://platform.openai.com/docs/api-reference/chat/create
 */

import type { GenerateOptions, LLMProvider, ProviderConfig } from "./types";

/**
 * Default model for OpenAI.
 *
 * ## AI Concept: Model Selection for Cost/Quality (2025)
 *
 * OpenAI pricing varies by model (check platform.openai.com for current rates).
 * GPT-4.1 offers the best value for coding tasks with its 1M token context.
 *
 * For code review, GPT-4.1 offers the best value:
 * - Strong coding performance (80.1% MMLU, 50.3% GPQA)
 * - Massive 1M token context for large diffs
 * - Better instruction following than GPT-4o
 *
 * @see https://platform.openai.com/docs/models
 */
const DEFAULT_MODEL = "gpt-4.1";

/**
 * OpenAI API types.
 *
 * Defined locally to avoid requiring 'openai' at compile time.
 */
interface OpenAIMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

interface OpenAIStreamChunk {
	choices: {
		delta: {
			content?: string;
		};
	}[];
}

interface OpenAIClient {
	chat: {
		completions: {
			create(options: {
				model: string;
				messages: OpenAIMessage[];
				max_tokens?: number;
				temperature?: number;
				stream?: boolean;
			}): Promise<AsyncIterable<OpenAIStreamChunk>>;
		};
	};
}

/**
 * OpenAI LLM provider using the OpenAI API.
 *
 * ## AI Concept: API Compatibility
 *
 * Many services offer "OpenAI-compatible" APIs:
 * - Azure OpenAI
 * - Local models with OpenAI-compatible endpoints
 * - Other cloud providers
 *
 * These can use this same provider with a different baseUrl.
 *
 * ## Usage
 *
 * ```typescript
 * const openai = new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY });
 *
 * // Check if API key is valid
 * const healthy = await openai.checkHealth();
 *
 * // Generate a review
 * const review = await openai.streamResponse(
 *   prompt,
 *   (chunk) => process.stdout.write(chunk)
 * );
 * ```
 */
export class OpenAIProvider implements LLMProvider {
	/** Provider identifier used for CLI selection. */
	readonly name = "openai";

	/** Human-readable provider name for display. */
	readonly displayName = "OpenAI";

	/** OpenAI API key for authentication. */
	private apiKey: string | undefined;

	/** Optional custom base URL for API-compatible services. */
	private baseUrl: string | undefined;

	/** Default model to use when none specified. */
	private defaultModel: string;

	/** Cached OpenAI client instance. */
	private client: OpenAIClient | null = null;

	/**
	 * Creates a new OpenAI provider.
	 *
	 * @param config - Provider configuration
	 */
	constructor(config?: ProviderConfig) {
		this.apiKey = config?.apiKey ?? process.env.OPENAI_API_KEY;
		this.baseUrl = config?.baseUrl ?? process.env.OPENAI_BASE_URL;
		this.defaultModel = config?.defaultModel ?? process.env.OPENAI_DEFAULT_MODEL ?? DEFAULT_MODEL;
	}

	/**
	 * Checks if OpenAI is available.
	 */
	checkHealth(): Promise<boolean> {
		return Promise.resolve(Boolean(this.apiKey));
	}

	/**
	 * Gets available OpenAI models.
	 *
	 * ## AI Concept: Model Access Tiers (2025)
	 *
	 * Not all OpenAI API keys have access to all models:
	 * - Free tier: Limited access
	 * - Pay-as-you-go: Access to most models
	 * - Enterprise: All models + higher limits
	 *
	 * Current model families:
	 * - GPT-4.1: Best for coding (4.1, 4.1-mini, 4.1-nano)
	 * - GPT-4o: Multimodal flagship (4o, 4o-mini)
	 * - o-series: Reasoning models (o3, o4-mini)
	 *
	 * @see https://platform.openai.com/docs/models
	 */
	getAvailableModels(): Promise<string[]> {
		return Promise.resolve(["gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o", "gpt-4o-mini", "o3", "o4-mini"]);
	}

	/**
	 * Checks if a model is available.
	 */
	async isModelAvailable(modelName: string): Promise<boolean> {
		const models = await this.getAvailableModels();

		return models.some((model) => model.includes(modelName) || modelName.includes(model));
	}

	/**
	 * Streams a response from OpenAI.
	 *
	 * ## AI Concept: Chat Completions Streaming
	 *
	 * OpenAI's streaming sends delta updates for each token:
	 * ```json
	 * {"choices":[{"delta":{"content":"Hello"}}]}
	 * {"choices":[{"delta":{"content":" world"}}]}
	 * ```
	 *
	 * The `content` field accumulates to form the full response.
	 * Empty deltas may appear at start (role assignment) and end.
	 */
	async streamResponse(prompt: string, onChunk: (chunk: string) => void, options?: GenerateOptions): Promise<string> {
		const client = await this.getClient();
		const model = options?.model ?? this.defaultModel;

		const stream = await client.chat.completions.create({
			model,
			messages: [{ role: "user", content: prompt }],
			max_tokens: options?.maxTokens ?? 2048,
			temperature: options?.temperature ?? 0.7,
			stream: true,
		});

		let fullResponse = "";

		for await (const chunk of stream) {
			const content = chunk.choices[0]?.delta?.content;

			if (content) {
				fullResponse += content;
				onChunk(content);
			}
		}

		return fullResponse;
	}

	/**
	 * Gets the default model for OpenAI.
	 */
	getDefaultModel(): string {
		return this.defaultModel;
	}

	/**
	 * Lazily loads the OpenAI SDK.
	 *
	 * ## AI Concept: SDK Lazy Loading
	 *
	 * Same pattern as Claude - only load the SDK when needed.
	 * This keeps the tool lightweight for users who don't use OpenAI.
	 */
	private async getClient(): Promise<OpenAIClient> {
		if (this.client) {
			return this.client;
		}

		if (!this.apiKey) {
			throw new Error("OPENAI_API_KEY environment variable is required for OpenAI provider");
		}

		try {
			const { default: OpenAI } = await import("openai");

			this.client = new OpenAI({
				apiKey: this.apiKey,
				baseURL: this.baseUrl,
			}) as unknown as OpenAIClient;

			return this.client;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND") {
				throw new Error("openai package is not installed. Run: npm install openai\n" + "Or use a different provider: --provider ollama");
			}

			throw error;
		}
	}
}
