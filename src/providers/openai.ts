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
 * ## AI Concept: GPT Model Tiers
 *
 * OpenAI offers different model tiers:
 * - **GPT-4 Turbo**: Best quality, 128K context, higher cost
 * - **GPT-4o**: Latest model, better for many tasks
 * - **GPT-4o-mini**: Cheaper, faster, good for simple tasks
 * - **GPT-3.5 Turbo**: Legacy, cheaper, less capable
 *
 * For code review, GPT-4 Turbo or GPT-4o is recommended for
 * their strong reasoning and large context windows.
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
 * ## AI Concept: Model Selection for Cost/Quality
 *
 * OpenAI pricing is per-token:
 * - **GPT-4 Turbo**: ~$10/1M input, ~$30/1M output
 * - **GPT-4o**: ~$5/1M input, ~$15/1M output
 * - **GPT-4o-mini**: ~$0.15/1M input, ~$0.6/1M output
 *
 * For code review, GPT-4o offers the best value:
 * - Good reasoning for code analysis
 * - Large context for big diffs
 * - Reasonable cost for regular use
 */
const DEFAULT_MODEL = "gpt-4o";

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
	readonly name = "openai";
	readonly displayName = "OpenAI";

	private apiKey: string | undefined;
	private baseUrl: string | undefined;
	private defaultModel: string;
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

	/**
	 * Checks if OpenAI is available.
	 */
	async checkHealth(): Promise<boolean> {
		return Boolean(this.apiKey);
	}

	/**
	 * Gets available OpenAI models.
	 *
	 * ## AI Concept: Model Access Tiers
	 *
	 * Not all OpenAI API keys have access to all models:
	 * - Free tier: Limited to GPT-3.5
	 * - Pay-as-you-go: Access to GPT-4 after first payment
	 * - Enterprise: All models + higher limits
	 *
	 * We return commonly available models.
	 */
	async getAvailableModels(): Promise<string[]> {
		return ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo"];
	}

	/**
	 * Checks if a model is available.
	 */
	async isModelAvailable(modelName: string): Promise<boolean> {
		const models = await this.getAvailableModels();

		return models.some((model) => model.includes(modelName) ?? modelName.includes(model));
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
}
