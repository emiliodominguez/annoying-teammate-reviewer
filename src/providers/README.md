# LLM Providers

This directory contains the provider abstraction layer that enables support for multiple LLM backends.

## Architecture

```
providers/
├── index.ts        # Barrel exports
├── types.ts        # LLMProvider interface and types
├── registry.ts     # Provider registration and resolution
├── ollama.ts       # Ollama provider (local)
├── claude.ts       # Anthropic Claude provider
├── openai.ts       # OpenAI provider
└── gemini.ts       # Google Gemini provider
```

## Core Interface

All providers implement the `LLMProvider` interface:

```typescript
interface LLMProvider {
  /** Provider identifier (e.g., "ollama", "claude") */
  readonly name: string;

  /** Human-readable display name */
  readonly displayName: string;

  /** Check if provider is available/configured */
  checkHealth(): Promise<boolean>;

  /** Get list of available models */
  getAvailableModels(): Promise<string[]>;

  /** Check if specific model is available */
  isModelAvailable(modelName: string): Promise<boolean>;

  /** Stream response with chunk callback */
  streamResponse(
    prompt: string,
    onChunk: (chunk: string) => void,
    options?: GenerateOptions
  ): Promise<string>;

  /** Get provider's default model */
  getDefaultModel(): string;
}
```

## Provider Registry

The `ProviderRegistry` manages provider instances with lazy loading:

```typescript
import { providerRegistry } from "./providers";

// Register a provider class (lazy instantiation)
providerRegistry.registerClass("custom", MyCustomProvider);

// Get a provider instance (instantiates on first access)
const provider = providerRegistry.get("ollama");

// List available providers
const providers = providerRegistry.list(); // ["ollama", "claude", "openai", "gemini"]
```

## Built-in Providers

### Ollama (Local)

Runs entirely on your machine - no data leaves your environment.

```typescript
import { OllamaProvider } from "./providers";

const provider = new OllamaProvider({
  baseUrl: "http://localhost:11434", // default
  defaultModel: "llama3.2"
});
```

**Environment Variables:**
- `OLLAMA_BASE_URL` - Ollama API URL (default: `http://localhost:11434`)
- `OLLAMA_DEFAULT_MODEL` - Default model (default: `codellama`)

### Claude (Anthropic)

Uses Anthropic's Claude models via their API.

```typescript
import { ClaudeProvider } from "./providers";

const provider = new ClaudeProvider({
  apiKey: process.env.ANTHROPIC_API_KEY,
  defaultModel: "claude-sonnet-4-20250514"
});
```

**Environment Variables:**
- `ANTHROPIC_API_KEY` - Required API key
- `CLAUDE_DEFAULT_MODEL` - Default model (default: `claude-sonnet-4-20250514`)

### OpenAI

Uses OpenAI's GPT models via their API.

```typescript
import { OpenAIProvider } from "./providers";

const provider = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY,
  baseUrl: "https://api.openai.com/v1", // optional
  defaultModel: "gpt-4o"
});
```

**Environment Variables:**
- `OPENAI_API_KEY` - Required API key
- `OPENAI_BASE_URL` - Custom API URL (for Azure OpenAI, etc.)
- `OPENAI_DEFAULT_MODEL` - Default model (default: `gpt-4o`)

### Gemini (Google)

Uses Google's Gemini models via their API.

```typescript
import { GeminiProvider } from "./providers";

const provider = new GeminiProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
  defaultModel: "gemini-2.0-flash"
});
```

**Environment Variables:**
- `GOOGLE_AI_API_KEY` or `GEMINI_API_KEY` - Required API key
- `GEMINI_DEFAULT_MODEL` - Default model (default: `gemini-2.0-flash`)

## Creating a Custom Provider

To add a new provider:

1. Create a new file (e.g., `custom.ts`)
2. Implement the `LLMProvider` interface
3. Register it in the index.ts

```typescript
// custom.ts
import type { LLMProvider, GenerateOptions, ProviderConfig } from "./types";

export interface CustomProviderConfig extends ProviderConfig {
  customOption?: string;
}

export class CustomProvider implements LLMProvider {
  readonly name = "custom";
  readonly displayName = "Custom Provider";

  private config: CustomProviderConfig;

  constructor(config: CustomProviderConfig = {}) {
    this.config = {
      apiKey: config.apiKey || process.env.CUSTOM_API_KEY,
      defaultModel: config.defaultModel || process.env.CUSTOM_DEFAULT_MODEL || "default-model"
    };
  }

  async checkHealth(): Promise<boolean> {
    return !!this.config.apiKey;
  }

  async getAvailableModels(): Promise<string[]> {
    return ["model-1", "model-2"];
  }

  async isModelAvailable(modelName: string): Promise<boolean> {
    const models = await this.getAvailableModels();
    return models.some(m => m.includes(modelName) || modelName.includes(m));
  }

  async streamResponse(
    prompt: string,
    onChunk: (chunk: string) => void,
    options?: GenerateOptions
  ): Promise<string> {
    // Implement streaming logic
    const model = options?.model || this.getDefaultModel();
    // ... call your API, stream chunks via onChunk
    return "complete response";
  }

  getDefaultModel(): string {
    return this.config.defaultModel || "default-model";
  }
}
```

## AI Concepts

### Streaming Protocols

Different providers use different streaming protocols:

- **Ollama**: NDJSON (Newline Delimited JSON) - one JSON object per line
- **Claude/OpenAI**: Server-Sent Events (SSE) - event stream format
- **Gemini**: SSE with different event structure

Each provider adapter handles the protocol differences internally.

### Lazy SDK Loading

SDKs are loaded dynamically when the provider is first used:

```typescript
private async getClient() {
  if (!this.client) {
    const { default: SDK } = await import("sdk-package");
    this.client = new SDK({ apiKey: this.config.apiKey });
  }
  return this.client;
}
```

This prevents loading unnecessary SDKs and reduces startup time.

### Token Limits

Different models have different context window sizes:

| Provider | Model               | Context Window |
| -------- | ------------------- | -------------- |
| Ollama   | llama3.2            | ~8K tokens     |
| Claude   | claude-sonnet-4     | 200K tokens    |
| OpenAI   | gpt-4o              | 128K tokens    |
| Gemini   | gemini-2.0-flash    | 1M tokens      |

The tool uses smart truncation to fit within limits (see `truncate.ts`).
