# GitHub Copilot Instructions

## Project Context

This is **Annoying Teammate Code Reviewer**, an AI-powered CLI tool for code review using multiple LLM providers (Ollama, Claude, OpenAI, Gemini). It's a learning project demonstrating AI integration and prompt engineering.

## Code Style Preferences

### TypeScript

- Use strict TypeScript with explicit return types on all functions
- Prefer `import type { X }` for type-only imports
- Never use `any` - use proper types or `unknown`
- Use `interface` for object shapes, `type` for unions/intersections

### Naming

- Files: `kebab-case.ts`
- Classes/Interfaces/Types: `PascalCase`
- Functions/variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Booleans: prefix with `is`, `has`, `should`, `can`

### Functions

- Keep functions small and focused (single responsibility)
- Use early returns to reduce nesting
- Prefer async/await over raw promises
- Always handle errors in async functions

### Comments

- Use JSDoc for exported functions with `@param` and `@returns`
- For AI/LLM concepts, use `## AI Concept:` header format
- Explain "why" not "what" in inline comments

## Project Structure

```
src/
├── core/           # Config and prompt templates
├── providers/      # LLM provider adapters (ollama, claude, openai, gemini)
├── plugins/        # Plugin system (hooks, loader, types)
├── utils/          # Git operations, diff truncation
└── index.ts        # CLI entry point
```

## Testing Patterns

- Test files: `*.spec.ts` next to source files
- Use Jest with ESM support
- Structure tests with Given/When/Then comments
- Mock external dependencies (fetch, SDKs)

```typescript
test("should do something", () => {
	// Given
	const input = "test";

	// When
	const result = functionUnderTest(input);

	// Then
	expect(result).toEqual("expected");
});
```

## Provider Implementation

When implementing LLM providers:

```typescript
export class MyProvider implements LLMProvider {
	readonly name = "my-provider";
	readonly displayName = "My Provider";

	async checkHealth(): Promise<boolean> {
		/* ... */
	}
	async getAvailableModels(): Promise<string[]> {
		/* ... */
	}
	async isModelAvailable(model: string): Promise<boolean> {
		/* ... */
	}
	async streamResponse(prompt: string, onChunk: (chunk: string) => void, options?: GenerateOptions): Promise<string> {
		/* ... */
	}
	getDefaultModel(): string {
		/* ... */
	}
}
```

## Common Imports

```typescript
// Types
import type { LLMProvider, GenerateOptions, ProviderConfig } from "./providers/types";
import type { ReviewContext } from "./utils/git";
import type { Plugin, PluginContext } from "./plugins/types";

// Utilities
import { getDiff, getReviewContext, hasChanges } from "./utils/git";
import { smartTruncate, splitIntoBatches } from "./utils/truncate";
import { buildReviewPrompt } from "./core/prompts";

// Config
import { REVIEWER_NAME, DEFAULT_LLM_PROVIDER } from "./core/config";
```

## Commit Messages

Follow Conventional Commits:

- `feat(scope): add new feature`
- `fix(scope): fix bug`
- `refactor(scope): refactor code`
- `test(scope): add tests`
- `docs(scope): update documentation`

Scopes: `core`, `providers`, `plugins`, `utils`, `cli`, `deps`, `config`

## Don't

- Don't use `console.log` for user output in library code (use the logger pattern)
- Don't hardcode API keys (use environment variables)
- Don't leave empty catch blocks
- Don't use `@ts-ignore` or `@ts-expect-error` without explanation
- Don't create files without tests for non-trivial logic
