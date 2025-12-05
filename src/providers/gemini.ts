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
 * ## AI Concept: Gemini Model Tiers
 *
 * Gemini offers models optimized for different use cases:
 * - **Gemini 1.5 Pro**: Best quality, 1M context, good for complex tasks
 * - **Gemini 1.5 Flash**: Fast and cheap, 1M context, great for reviews
 * - **Gemini 2.0 Flash**: Latest, even faster, improved reasoning
 *
 * For code review, Flash models offer the best value:
 * - Fast enough for interactive use
 * - Good code understanding
 * - Very cost-effective
 *
 * ## AI Concept: Why 1M Context Matters
 *
 * Most LLMs have 4K-200K token limits. Gemini's 1M tokens means:
 * - Review entire repositories, not just diffs
 * - Include all related files for context
 * - No need for truncation or batching
 *
 * However, for code review, we still use diffs (more focused).
 *
 * ## AI Concept: Google AI vs Vertex AI
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
 * ## AI Concept: Choosing Gemini Models
 *
 * Gemini pricing (as of 2024):
 * - **Gemini 1.5 Flash**: ~$0.075/1M input, ~$0.30/1M output (very cheap!)
 * - **Gemini 1.5 Pro**: ~$3.50/1M input, ~$10.50/1M output
 *
 * Flash is perfect for code review:
 * - 10-20x cheaper than GPT-4
 * - Still very capable for structured tasks
 * - Fastest inference of major models
 */
const DEFAULT_MODEL = "gemini-2.0-flash";

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
 * ## AI Concept: Gemini's Unique Streaming
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
	readonly name = "gemini";
	readonly displayName = "Gemini";

	private apiKey: string | undefined;
	private defaultModel: string;
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

	/**
	 * Checks if Gemini is available.
	 */
	async checkHealth(): Promise<boolean> {
		return Boolean(this.apiKey);
	}

	/**
	 * Gets available Gemini models.
	 *
	 * ## AI Concept: Gemini Model Naming
	 *
	 * Gemini models use semantic names:
	 * - `gemini-1.5-flash` - Fast, efficient
	 * - `gemini-1.5-pro` - Higher quality
	 * - `gemini-2.0-flash-exp` - Latest experimental
	 *
	 * The "-exp" suffix indicates experimental/preview models.
	 */
	async getAvailableModels(): Promise<string[]> {
		return ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash", "gemini-1.5-flash-8b", "gemini-1.5-pro"];
	}

	/**
	 * Checks if a model is available.
	 */
	async isModelAvailable(modelName: string): Promise<boolean> {
		const models = await this.getAvailableModels();

		return models.some((model) => model.includes(modelName) ?? modelName.includes(model));
	}

	/**
	 * Streams a response from Gemini.
	 *
	 * ## AI Concept: Gemini Streaming
	 *
	 * Gemini's streaming is chat-based:
	 * 1. Create a chat session (even for single turns)
	 * 2. Call sendMessageStream with the prompt
	 * 3. Iterate over the stream, calling text() on each chunk
	 *
	 * The chat model maintains conversation history, but we
	 * start fresh for each review (no history needed).
	 *
	 * ## AI Concept: Safety Settings
	 *
	 * Gemini has built-in safety filters that can block responses.
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
}
