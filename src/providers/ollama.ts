/**
 * @fileoverview Ollama provider adapter for local LLM inference.
 *
 * This module wraps Ollama's API in the LLMProvider interface, enabling
 * the reviewer to use Ollama alongside cloud providers.
 *
 * ## What is Ollama?
 *
 * Ollama is like "Docker for LLMs" - it downloads, manages, and runs language models
 * locally on your machine. Key benefits:
 * - **Privacy**: Your code never leaves your machine
 * - **Cost**: No API fees after the initial download
 * - **Speed**: No network latency for each token
 * - **Offline**: Works without internet after model is downloaded
 *
 * ## AI Concept: Local vs Cloud LLMs
 *
 * | Aspect          | Local (Ollama)         | Cloud (OpenAI, Claude) |
 * |-----------------|------------------------|------------------------|
 * | Privacy         | Code stays local       | Sent to remote servers |
 * | Cost            | Free (after download)  | Pay per token          |
 * | Quality         | Good (7B-70B params)   | Best (>100B params)    |
 * | Speed           | Depends on hardware    | Usually fast           |
 * | Context window  | 4K-32K typically       | 128K+ available        |
 *
 * For code review, local models are a good tradeoff - privacy matters,
 * and review quality is "good enough" with modern 7B-13B models.
 *
 * ## AI Concept: Model Selection
 *
 * Different models have different characteristics:
 * - **llama3.2** - Meta's latest, good balance of speed/quality
 * - **codellama** - Fine-tuned on code, better for programming tasks
 * - **mistral** - Fast and efficient, good for simpler tasks
 * - **qwen2.5-coder** - Alibaba's code model, very capable
 *
 * Larger models (13B, 70B) are smarter but slower and need more RAM.
 * For code review, 7B-13B models are usually sufficient.
 *
 * @see https://github.com/ollama/ollama/blob/main/docs/api.md
 */

import type { GenerateOptions, LLMProvider, ProviderConfig } from "./types";

/**
 * Default base URL for Ollama API.
 */
const DEFAULT_BASE_URL = "http://localhost:11434";

/**
 * Default model for Ollama.
 *
 * ## AI Concept: Model Selection for Tasks
 *
 * The "best" model depends on your task and hardware:
 * - **7B models** (llama3.2, mistral): Fast, ~8GB RAM, good for simple tasks
 * - **13B models**: Better reasoning, ~16GB RAM, good balance
 * - **70B models**: Near cloud quality, ~64GB RAM, slow on CPU
 *
 * For code review, 7B-13B is usually sufficient because:
 * - Reviews are focused tasks with clear output format
 * - We provide extensive context (standards, diff)
 * - Hallucination prevention is more about prompts than model size
 */
const DEFAULT_MODEL = "codellama";

/**
 * Represents a model available in Ollama.
 */
interface OllamaModel {
	/** Model identifier (e.g., "llama3.2:latest", "codellama:7b") */
	name: string;
	/** ISO timestamp of when the model was last modified/downloaded */
	modified_at: string;
	/** Model size in bytes (useful for knowing disk usage) */
	size: number;
}

/**
 * Response shape from Ollama's `/api/tags` endpoint.
 */
interface OllamaTagsResponse {
	models?: OllamaModel[];
}

/**
 * Response shape from Ollama's streaming `/api/generate` endpoint.
 *
 * ## AI Concept: NDJSON Streaming Protocol
 *
 * Ollama uses Newline-Delimited JSON (NDJSON) for streaming:
 * ```
 * {"response":"Hello","done":false}
 * {"response":" world","done":false}
 * {"response":"!","done":true}
 * ```
 *
 * Each line is a complete JSON object. The `done` field signals
 * when generation is complete. We parse each line independently.
 *
 * This is different from Server-Sent Events (SSE) used by Claude/OpenAI.
 * NDJSON is simpler but less standard.
 */
interface OllamaGenerateResponse {
	/** The generated text (partial in streaming mode) */
	response: string;
	/** True when generation is complete */
	done: boolean;
}

/**
 * Ollama LLM provider for local inference.
 *
 * ## AI Concept: Streaming vs Batch Generation
 *
 * LLMs generate text token-by-token (not all at once). Two approaches:
 *
 * **Batch (Non-streaming)**:
 * ```
 * User waits... [30 seconds pass] ...Complete response appears
 * ```
 *
 * **Streaming**:
 * ```
 * User sees: "The" → "The code" → "The code looks" → "The code looks good"
 * ```
 *
 * We use streaming because:
 * - Users see progress immediately (feels faster)
 * - Can start reading while generation continues
 * - Provides confidence the tool is working
 *
 * ## Usage
 *
 * ```typescript
 * const ollama = new OllamaProvider();
 *
 * // Check if Ollama is running
 * const healthy = await ollama.checkHealth();
 *
 * // Generate a review
 * const review = await ollama.streamResponse(
 *   prompt,
 *   (chunk) => process.stdout.write(chunk)
 * );
 * ```
 */
export class OllamaProvider implements LLMProvider {
	readonly name = "ollama";
	readonly displayName = "Ollama";

	private baseUrl: string;
	private defaultModel: string;

	/**
	 * Creates a new Ollama provider.
	 *
	 * @param config - Optional configuration
	 */
	constructor(config?: ProviderConfig) {
		this.baseUrl = config?.baseUrl || process.env.OLLAMA_BASE_URL || DEFAULT_BASE_URL;
		this.defaultModel = config?.defaultModel || process.env.OLLAMA_DEFAULT_MODEL || DEFAULT_MODEL;
	}

	/**
	 * Checks if Ollama is running and accessible.
	 *
	 * ## AI Concept: Health Checks for Local Services
	 *
	 * Unlike cloud APIs that are (usually) always available, Ollama
	 * must be running locally. Common issues:
	 * - Ollama not installed
	 * - Ollama service not started (`ollama serve`)
	 * - Running on non-default port
	 *
	 * We check by hitting the /api/tags endpoint which always exists.
	 */
	async checkHealth(): Promise<boolean> {
		try {
			const response = await fetch(`${this.baseUrl}/api/tags`);

			return response.ok;
		} catch {
			return false;
		}
	}

	/**
	 * Gets all locally available models.
	 *
	 * ## AI Concept: Model Management in Ollama
	 *
	 * Ollama models must be downloaded before use:
	 * ```bash
	 * ollama pull llama3.2
	 * ollama pull codellama:7b
	 * ```
	 *
	 * This method returns only models that are already downloaded,
	 * not all models that Ollama supports.
	 */
	async getAvailableModels(): Promise<string[]> {
		try {
			const response = await fetch(`${this.baseUrl}/api/tags`);

			if (!response.ok) return [];
			const data = (await response.json()) as OllamaTagsResponse;

			return data.models?.map((model) => model.name) || [];
		} catch {
			return [];
		}
	}

	/**
	 * Checks if a specific model is available locally.
	 *
	 * Uses prefix matching so "llama3.2" matches "llama3.2:latest".
	 */
	async isModelAvailable(modelName: string): Promise<boolean> {
		const models = await this.getAvailableModels();

		return models.some((model) => model.startsWith(modelName));
	}

	/**
	 * Streams a response from Ollama.
	 *
	 * ## AI Concept: NDJSON Streaming
	 *
	 * Ollama sends responses as Newline-Delimited JSON:
	 * 1. Each line is a complete JSON object
	 * 2. Each object has `response` (text) and `done` (boolean)
	 * 3. Chunks may split across network packets
	 *
	 * The tricky part is handling chunk boundaries:
	 * ```
	 * Packet 1: '{"response":"Hel'
	 * Packet 2: 'lo","done":false}\n{"response":" world","done":false}'
	 * ```
	 *
	 * We handle this by splitting on newlines and catching JSON parse errors
	 * (partial JSON from packet boundaries is skipped, then completed in next packet).
	 *
	 * ## AI Concept: Time to First Token (TTFT)
	 *
	 * The time between sending a prompt and receiving the first token
	 * is a key UX metric. Streaming lets users see progress immediately,
	 * even if total generation time is the same.
	 */
	async streamResponse(prompt: string, onChunk: (chunk: string) => void, options?: GenerateOptions): Promise<string> {
		const model = options?.model || this.defaultModel;

		const response = await fetch(`${this.baseUrl}/api/generate`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model,
				prompt,
				stream: true,
				options: {
					temperature: options?.temperature ?? 0.7,
					num_predict: options?.maxTokens ?? 2048
				}
			})
		});

		if (!response.ok) {
			const error = await response.text();

			throw new Error(`Ollama error: ${error}`);
		}

		const stream = response.body;

		if (!stream) {
			throw new Error("No response stream received from Ollama");
		}

		const reader = stream.getReader();
		const decoder = new TextDecoder();
		let fullResponse = "";

		while (true) {
			const { done, value } = await reader.read();

			if (done) break;

			// Decode bytes to string, handling multi-byte characters
			const chunk = decoder.decode(value, { stream: true });

			// Split into lines - Ollama sends one JSON object per line
			const lines = chunk.split("\n").filter(Boolean);

			for (const line of lines) {
				try {
					const json = JSON.parse(line) as OllamaGenerateResponse;

					if (json.response) {
						fullResponse += json.response;
						onChunk(json.response);
					}
				} catch {
					// Partial JSON from chunk boundary - next chunk will complete it
					// This is expected behavior with NDJSON streaming
				}
			}
		}

		return fullResponse;
	}

	/**
	 * Gets the default model for Ollama.
	 */
	getDefaultModel(): string {
		return this.defaultModel;
	}
}
