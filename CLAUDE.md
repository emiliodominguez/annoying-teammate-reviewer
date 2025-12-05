# CLAUDE.md - Project Guidelines for AI Assistants

This file provides context for AI assistants (Claude Code, etc.) working on this codebase.

## Project Overview

**Annoying Teammate Code Reviewer** is an AI-powered CLI tool that reviews git diffs using various LLM providers (Ollama, Claude, OpenAI, Gemini). It's designed as a learning project for understanding AI integration, prompt engineering, and building AI-powered developer tools.

## Architecture

```
src/
├── core/           # Core logic (config, prompts)
├── providers/      # LLM provider implementations (ollama, claude, openai, gemini)
├── plugins/        # Plugin system for extensibility
├── utils/          # Utilities (git operations, diff truncation)
└── index.ts        # CLI entry point
```

## Code Standards

### TypeScript

- Use strict TypeScript (`strict: true` in tsconfig)
- Always use `import type` for type-only imports
- Avoid `any` - use proper types or `unknown`
- All functions must have explicit return types
- Use type predicates for type guards: `(value): value is Type`

### Naming Conventions

- Files/folders: `kebab-case`
- Components/Classes/Types/Interfaces: `PascalCase`
- Functions/variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Boolean variables: use `is/has/should` prefixes

### Code Organization

- Keep functions focused (single responsibility)
- Co-locate related files (implementation + tests)
- Use path aliases over deep relative imports

### Error Handling

- No empty catch blocks - at minimum log the error
- Async operations must handle errors
- Use try/catch at boundaries, not around every line

### Documentation

- Educational comments explaining AI/LLM concepts use `## AI Concept:` headers
- Exported functions need JSDoc with `@param` and `@returns`
- Complex logic needs comments explaining "why" not "what"

## Testing

- Tests use Jest with ESM support
- Test files: `*.spec.ts` co-located with source
- Use Given/When/Then structure in test comments
- Mock external dependencies (fetch, SDKs)
- Run tests: `npm test`
- Run with coverage: `npm run test:coverage`

## Common Commands

```bash
npm run review              # Review working tree changes
npm run review:staged       # Review only staged changes
npm run review:branch       # Review current branch vs main
npm test                    # Run tests
npm run lint:fix            # Fix linting issues
npm run format              # Format code with Prettier
npm run build               # TypeScript build
```

## Provider Implementation Pattern

When adding a new provider, follow this pattern:

1. Implement the `LLMProvider` interface from `src/providers/types.ts`
2. Use lazy SDK loading (dynamic `import()`)
3. Support streaming responses via `onChunk` callback
4. Handle health checks and model availability
5. Register in `src/index.ts` using `providerRegistry.registerClass()`

## Prompt Engineering Notes

- Prompts are in `src/core/prompts.ts`
- Personality configuration is in `src/core/config.ts`
- Anti-hallucination rules are critical - the AI must only discuss code in the diff
- Output format (Verdict, Issues Found, Summary) enables CI integration

## Git Workflow

- Use Conventional Commits: `type(scope): subject`
- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `style`, `perf`
- Scopes: `core`, `providers`, `plugins`, `utils`, `cli`, `deps`, `config`
- Commits are enforced via commitlint and husky hooks
