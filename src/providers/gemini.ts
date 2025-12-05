/**
 * @fileoverview Google Gemini provider for cloud-based LLM inference.
 *
 * This module wraps the Google Generative AI API in the LLMProvider interface,
 * enabling the reviewer to use Gemini models for code review.
 *
 * ## What is Gemini?
 *
 * Gemini is Google's family of AI models, known for:
 * - **Massive context**: Up to 1M tokens (entire codebases at once!)
 * - **Speed**: Very fast inference, especially Gemini Flash
 * - **Multimodal**: Can process images, video, audio (not used here)
 * - **Cost-effective**: Generally cheaper than GPT-4/Claude
 *
 * ## Gemini Model Tiers (2025)
 *
 * Gemini offers models optimized for different use cases:
 * - **Gemini 2.5 Pro**: State-of-the-art thinking model, complex reasoning
 * - **Gemini 2.5 Flash**: Best price-performance balance
 * - **Gemini 2.5 Flash-Lite**: Fastest, optimized for cost-efficiency
 * - **Gemini 2.0 Flash**: Multimodal, 1M context, cost-effective
 *
 * Note: Gemini 1.5 models were deprecated April 29, 2025.
 *
 * For code review, Flash models offer the best value:
 * - Fast enough for interactive use
 * - Good code understanding
 * - Very cost-effective
 *
 * @see https://ai.google.dev/gemini-api/docs/models
 *
 * ## Why 1M Context Matters
 *
 * Most LLMs have 4K-200K token limits. Gemini's 1M tokens means:
 * - Review entire repositories, not just diffs
 * - Include all related files for context
 * - No need for truncation or batching
 *
 * However, for code review, we still use diffs (more focused).
 *
 * ## Google AI vs Vertex AI
 *
 * Google offers Gemini through two APIs:
 * - **Google AI (ai.google.dev)**: Simpler, API key auth, personal use
 * - **Vertex AI (cloud.google.com)**: Enterprise, service account auth
 *
 * This provider uses Google AI for simplicity. For enterprise,
 * consider creating a separate Vertex AI provider.
 *
 * @see https://ai.google.dev/api/python/google/generativeai
 */

import type { GenerateOptions, LLMProvider, ProviderConfig } from "./types";

/**
 * Default model for Gemini.
 *
 * Gemini offers competitive pricing (check ai.google.dev for current rates).
 * Flash models are generally much cheaper than Pro models.
 *
 * Flash is perfect for code review:
 * - Significantly cheaper than GPT-4/Claude
 * - Still very capable for structured tasks
 * - Fastest inference of major models
 */
const DEFAULT_MODEL = "gemini-2.5-flash";

/**
 * Google AI types.
 *
 * Defined locally to avoid requiring @google/generative-ai at compile time.
 */
interface GeminiContent {
	role: "user" | "model";
	parts: { text: string }[];
}

interface GeminiStreamChunk {
	text(): string;
}

interface GeminiChat {
	sendMessageStream(message: string): Promise<{
		stream: AsyncIterable<GeminiStreamChunk>;
	}>;
}

interface GeminiModel {
	startChat(options?: { history?: GeminiContent[] }): GeminiChat;
}

interface GeminiClient {
	getGenerativeModel(options: { model: string }): GeminiModel;
}

/**
 * Gemini LLM provider using Google's Generative AI API.
 *
 * Gemini's streaming is slightly different from OpenAI/Claude:
 * - Uses `sendMessageStream` instead of `create` with stream option
 * - Returns chunks with a `text()` method
 * - Simpler API, but less metadata per chunk
 *
 * ## Usage
 *
 * ```typescript
 * const gemini = new GeminiProvider({ apiKey: process.env.GOOGLE_AI_API_KEY });
 *
 * // Check if API key is valid
 * const healthy = await gemini.checkHealth();
 *
 * // Generate a review
 * const review = await gemini.streamResponse(
 *   prompt,
 *   (chunk) => process.stdout.write(chunk)
 * );
 * ```
 */
export class GeminiProvider implements LLMProvider {
	/** Provider identifier used for CLI selection. */
	readonly name = "gemini";

	/** Human-readable provider name for display. */
	readonly displayName = "Gemini";

	/** Google AI API key for authentication. */
	private apiKey: string | undefined;

	/** Default model to use when none specified. */
	private defaultModel: string;

	/** Cached Google Generative AI client instance. */
	private client: GeminiClient | null = null;

	/**
	 * Creates a new Gemini provider.
	 *
	 * @param config - Provider configuration
	 */
	constructor(config?: ProviderConfig) {
		this.apiKey = config?.apiKey ?? process.env.GOOGLE_AI_API_KEY ?? process.env.GEMINI_API_KEY;
		this.defaultModel = config?.defaultModel ?? process.env.GEMINI_DEFAULT_MODEL ?? DEFAULT_MODEL;
	}

	/**
	 * Checks if Gemini is available.
	 */
	checkHealth(): Promise<boolean> {
		return Promise.resolve(Boolean(this.apiKey));
	}

	/**
	 * Gets available Gemini models.
	 *
	 * Gemini models use semantic names:
	 * - `gemini-2.5-pro` - State-of-the-art thinking model
	 * - `gemini-2.5-flash` - Best price-performance
	 * - `gemini-2.5-flash-lite` - Fastest, cost-efficient
	 * - `gemini-2.0-flash` - Multimodal, cost-effective
	 *
	 * Note: 1.5 series models were deprecated April 29, 2025.
	 *
	 * @see https://ai.google.dev/gemini-api/docs/models
	 */
	getAvailableModels(): Promise<string[]> {
		return Promise.resolve(["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"]);
	}

	/**
	 * Checks if a model is available.
	 */
	async isModelAvailable(modelName: string): Promise<boolean> {
		const models = await this.getAvailableModels();

		return models.some((model) => model.includes(modelName) || modelName.includes(model));
	}

	/**
	 * Streams a response from Gemini.
	 *
	 * Gemini's streaming is chat-based:
	 * 1. Create a chat session (even for single turns)
	 * 2. Call sendMessageStream with the prompt
	 * 3. Iterate over the stream, calling text() on each chunk
	 *
	 * The chat model maintains conversation history, but we
	 * start fresh for each review (no history needed).
	 *
	 * Note: Gemini has built-in safety filters that can block responses.
	 * For code review (which may include error messages, security
	 * discussions), we might need to adjust these in production.
	 */
	async streamResponse(prompt: string, onChunk: (chunk: string) => void, options?: GenerateOptions): Promise<string> {
		const client = await this.getClient();
		const model = options?.model ?? this.defaultModel;

		const generativeModel = client.getGenerativeModel({ model });
		const chat = generativeModel.startChat();

		const result = await chat.sendMessageStream(prompt);

		let fullResponse = "";

		for await (const chunk of result.stream) {
			const text = chunk.text();

			if (text) {
				fullResponse += text;
				onChunk(text);
			}
		}

		return fullResponse;
	}

	/**
	 * Gets the default model for Gemini.
	 */
	getDefaultModel(): string {
		return this.defaultModel;
	}

	/**
	 * Lazily loads the Google Generative AI SDK.
	 */
	private async getClient(): Promise<GeminiClient> {
		if (this.client) {
			return this.client;
		}

		if (!this.apiKey) {
			throw new Error("GOOGLE_AI_API_KEY environment variable is required for Gemini provider");
		}

		try {
			const { GoogleGenerativeAI } = await import("@google/generative-ai");

			this.client = new GoogleGenerativeAI(this.apiKey) as unknown as GeminiClient;

			return this.client;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND") {
				throw new Error(
					"@google/generative-ai is not installed. Run: npm install @google/generative-ai\n" +
						"Or use a different provider: --provider ollama",
				);
			}

			throw error;
		}
	}
}
