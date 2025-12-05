# Plugin System

This directory contains the plugin system that allows extending the code reviewer's functionality.

## Architecture

```
plugins/
├── index.ts        # Barrel exports
├── types.ts        # Plugin interface and hook types
├── hooks.ts        # HookManager for executing plugin hooks
└── loader.ts       # Plugin discovery and loading
```

## How Plugins Work

Plugins interact with the review pipeline through "hooks" - functions called at specific points:

```
[User Input]
     ↓
beforePrompt ← Hook: plugins can modify the prompt
     ↓
[LLM Call]
     ↓
afterResponse ← Hook: plugins can process the response
     ↓
beforeVerdict ← Hook: plugins can modify verdict extraction
     ↓
[Output]
```

## Creating a Plugin

A plugin is a module that exports an object implementing the `Plugin` interface:

```typescript
// my-plugin.ts
import type { Plugin } from "./plugins";

const myPlugin: Plugin = {
  name: "my-awesome-plugin",
  version: "1.0.0",
  description: "Adds awesome features to code review",

  async init(context) {
    context.logger.info("Plugin initialized!");
  },

  async beforePrompt(context) {
    context.addToPrompt("\n\nAlso check for XSS vulnerabilities.");
  },

  async afterResponse(context) {
    if (context.response.includes("security")) {
      context.logger.warn("Security issue detected!");
    }
  },

  async beforeVerdict(context) {
    if (context.response.toLowerCase().includes("critical security")) {
      context.setVerdict("block");
    }
  }
};

export default myPlugin;
```

## Plugin Interface

```typescript
interface Plugin {
  /** Unique plugin name */
  name: string;

  /** Plugin version (semver) */
  version: string;

  /** Optional description */
  description?: string;

  /** Initialize plugin (called once at startup) */
  init?(context: PluginContext): Promise<void>;

  /** Called before prompt is sent to LLM */
  beforePrompt?(context: BeforePromptContext): Promise<void>;

  /** Called after receiving LLM response */
  afterResponse?(context: AfterResponseContext): Promise<void>;

  /** Called before verdict extraction */
  beforeVerdict?(context: BeforeVerdictContext): Promise<void>;

  /** Register custom CLI commands */
  commands?(): CommandDefinition[];

  /** Register custom LLM providers */
  providers?(): LLMProvider[];
}
```

## Hook Contexts

### BeforePromptContext

```typescript
interface BeforePromptContext {
  diff: string;              // The diff being reviewed
  reviewContext: ReviewContext;
  prompt: string;            // Current prompt
  addToPrompt(text: string): void;  // Append to prompt
  setPrompt(prompt: string): void;  // Replace prompt
}
```

### AfterResponseContext

```typescript
interface AfterResponseContext {
  response: string;          // LLM response
  reviewContext: ReviewContext;
  model: string;             // Model used
  providerName: string;      // Provider used
  setResponse(response: string): void;  // Modify response
}
```

### BeforeVerdictContext

```typescript
interface BeforeVerdictContext {
  response: string;
  verdict: "approve" | "request-changes" | "block" | "unknown";
  setVerdict(verdict: "approve" | "request-changes" | "block" | "unknown"): void;
}
```

### PluginContext (for init)

```typescript
interface PluginContext {
  config: {
    providerName: string;
    model: string;
    isQuiet: boolean;
    isJson: boolean;
  };
  logger: Logger;
  registerProvider(provider: LLMProvider): void;
}
```

## Plugin Examples

### Security Scanner Plugin

```typescript
const securityPlugin: Plugin = {
  name: "security-scanner",
  version: "1.0.0",

  async beforePrompt(context) {
    context.addToPrompt(`

## Additional Security Checks
Pay special attention to:
- SQL injection patterns
- XSS vulnerabilities
- Hardcoded credentials
- Insecure deserialization
`);
  },

  async beforeVerdict(context) {
    const criticalPatterns = [
      /critical.*security/i,
      /sql injection/i,
      /xss vulnerability/i
    ];

    if (criticalPatterns.some(p => p.test(context.response))) {
      context.setVerdict("block");
    }
  }
};
```

### GitHub Comments Plugin

```typescript
const githubPlugin: Plugin = {
  name: "github-comments",
  version: "1.0.0",

  async afterResponse(context) {
    if (process.env.GITHUB_TOKEN && process.env.GITHUB_PR_NUMBER) {
      await postCommentToGitHub(
        context.response,
        process.env.GITHUB_PR_NUMBER
      );
    }
  }
};
```

### Custom Provider Plugin

```typescript
const azurePlugin: Plugin = {
  name: "azure-openai",
  version: "1.0.0",

  async init(context) {
    context.registerProvider(new AzureOpenAIProvider({
      apiKey: process.env.AZURE_OPENAI_KEY,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT
    }));
  },

  providers() {
    return [new AzureOpenAIProvider()];
  }
};
```

## Plugin Discovery

Plugins are discovered from:

1. **npm packages** named `annoying-reviewer-plugin-*` in `package.json`
2. **Local directory** `.annoying-reviewer/plugins/`
3. **CLI flag** `--plugin ./path/to/plugin.js`

## Using the HookManager

The `HookManager` class executes hooks across all loaded plugins:

```typescript
import { HookManager } from "./plugins";

const hookManager = new HookManager();

// Register plugins
hookManager.registerPlugin(myPlugin);
hookManager.registerPlugin(anotherPlugin);

// Execute hooks
await hookManager.executeBeforePrompt({
  diff: "...",
  reviewContext: { ... },
  prompt: "original prompt",
  addToPrompt: (text) => { ... },
  setPrompt: (p) => { ... }
});
```

## Best Practices

1. **Keep plugins focused**: One plugin = one responsibility
2. **Handle errors gracefully**: Don't crash the main process
3. **Log appropriately**: Use `context.logger`, not `console.log`
4. **Be efficient**: Hooks run synchronously, don't block
5. **Document configuration**: List required env vars
6. **Version properly**: Follow semver for breaking changes
