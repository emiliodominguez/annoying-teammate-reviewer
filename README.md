# Annoying Teammate Code Reviewer

**A CLI code reviewer with configurable personality.** Reviews your git diffs using AI... either locally with Ollama (privacy-first, zero cost) or via cloud providers (Claude, GPT, Gemini). Get instant feedback on code changes before committing, without sending your code to third parties if you choose local models.

## Quick Start

```bash
# 1. Install Ollama and pull a model
brew install ollama && ollama serve
ollama pull deepcoder

# 2. Clone and run
git clone https://github.com/emiliodominguez/annoying-teammate-reviewer.git
cd annoying-teammate-reviewer
npm install
npm run review
```

**That's it.** The tool reviews your git diff and gives feedback.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)

> **⚠️ Important:** LLMs can hallucinate (they may invent issues that don't exist or miss real problems). Always use human judgment. This is a learning project, not a production-grade tool.

## Project Status

- **Stage:** Experimental / Learning
- **Purpose:** Exploring AI tooling, prompt engineering, and LLM integration patterns
- **Stability:** Use at your own risk
- **Contributions:** Welcome! See [Contributing](#contributing) below

## Supported Providers

| Provider | Description                             | Requires         |
| -------- | --------------------------------------- | ---------------- |
| Ollama   | Local LLM - no data leaves your machine | Ollama installed |
| Claude   | Anthropic's Claude 4.x models           | API key          |
| OpenAI   | GPT-4.1/5.x and other OpenAI models     | API key          |
| Gemini   | Google's Gemini 2.x models              | API key          |

## Prerequisites

### Option 1: Ollama (Local - Default)

1. **Install Ollama**

    ```bash
    brew install ollama
    ```

2. **Start Ollama**

    ```bash
    ollama serve
    ```

3. **Pull a model**

    ```bash
    ollama pull deepcoder     # Default - O3-mini level coding (14B)
    ```

    > **Tip:** Other recommended models for code review:
    >
    > - `qwen3` - Latest generation, excellent reasoning
    > - `codellama` - Battle-tested, 87 language support
    > - `deepseek-r1` - Open reasoning model, approaches frontier performance

### Option 2: Claude (Anthropic)

Set your API key:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

### Option 3: OpenAI

Set your API key:

```bash
export OPENAI_API_KEY=sk-...
```

### Option 4: Gemini (Google)

Set your API key:

```bash
export GOOGLE_AI_API_KEY=...
```

## Installation

```bash
git clone https://github.com/emiliodominguez/annoying-teammate-reviewer.git
cd annoying-teammate-reviewer
npm install
```

## Usage

### Review working tree changes (staged + unstaged)

```bash
npm run review
```

### Review only staged changes

```bash
npm run review:staged
```

### Review current branch vs main

```bash
npm run review:branch
```

### Review against specific branch

```bash
npx tsx src/index.ts --branch develop
```

### Use a different provider

```bash
npm run review -- --provider claude
npm run review -- --provider openai
npm run review -- --provider gemini
```

### Use a different model

```bash
npx tsx src/index.ts --model qwen3
npx tsx src/index.ts --provider claude --model claude-opus-4-5-20251101
npx tsx src/index.ts --provider openai --model gpt-4.1-mini
```

### List available providers

```bash
npx tsx src/index.ts --list-providers
```

### List available models

```bash
npx tsx src/index.ts --list-models
npx tsx src/index.ts --provider claude --list-models
```

### Review all files (batched iterative mode)

```bash
npm run review -- --all
```

### Include untracked (new) files

```bash
npm run review -- --untracked
```

### Export prompt for other LLMs (Claude, ChatGPT, etc.)

```bash
npm run review -- --export-prompt
npm run review -- --export-prompt | pbcopy  # Copy to clipboard
```

### CI mode (exit codes based on verdict)

```bash
npm run review -- --ci
# Exit code 0: Would approve
# Exit code 1: Would request changes or block
```

### Dry run (preview what would be reviewed)

```bash
npm run review -- --dry-run
```

### JSON output (for CI/CD integration)

```bash
npm run review -- --json
npm run review -- --json --ci  # Combine with CI mode
```

### Quiet mode (suppress spinner and info)

```bash
npm run review -- --quiet
npm run review -- -q
```

## CLI Options

| Option                  | Description                                                     |
| ----------------------- | --------------------------------------------------------------- |
| `-s, --staged`          | Review only staged changes                                      |
| `-b, --branch [target]` | Review changes compared to target branch (defaults to main)     |
| `-p, --provider <name>` | LLM provider to use (ollama, claude, openai, gemini)            |
| `-m, --model <model>`   | Model to use (defaults to provider's default)                   |
| `-a, --all`             | Review all files in batches (iterative mode)                    |
| `-u, --untracked`       | Include untracked (new) files in the review                     |
| `--list-providers`      | List available LLM providers                                    |
| `--list-models`         | List available models for the selected provider                 |
| `--export-prompt`       | Export the prompt to stdout for use with other LLMs             |
| `--ci`                  | CI mode: exit code 1 if reviewer would request changes or block |
| `--dry-run`             | Show what would be reviewed without calling the LLM             |
| `--json`                | Output results in JSON format (for CI/CD integration)           |
| `-q, --quiet`           | Suppress spinner and info, only show review result              |
| `-h, --help`            | Display help                                                    |
| `-V, --version`         | Display version                                                 |

## When to Use This

**Good for:**

- Quick sanity checks before committing
- Solo devs who miss pair programming feedback
- Learning: see how an AI would critique your code
- Teams wanting consistent review standards

**Not a replacement for:**

- Proper code review by humans
- Security audits
- Architecture reviews
- Performance profiling

## What It Catches

**Common Issues:**

- Missing error handling in async operations
- Unused imports and variables
- Magic numbers without explanation
- Functions doing too many things
- Copy-pasted code that should be abstracted
- Vague commit messages

**Known Limitations:**

- Cannot see full codebase context (only the diff)
- May miss architecture-level issues
- Performance issues requiring runtime profiling
- Complex business logic errors

## Example Output

**Reviewing this change:**

```diff
+ const sessionCache = new Map();
+
+ function getSession(userId) {
+   try {
+     return sessionCache.get(userId);
+   } catch (e) {
+     // Silent fail
+   }
+ }
```

**Output (using `deepcoder`):**

```
📋 Reviewing: working tree
   Branch: feature/add-user-auth
   Files: 1
   Provider: Ollama (deepcoder)

🔄 Would request changes

**Should fix:**
- `src/auth/session.ts:5` - This try/catch is swallowing errors silently.
  Map.get() doesn't throw, so this catch block will never execute. Either
  remove it or add actual error handling for the session lookup.

- `src/auth/session.ts:1` - Do we need this `sessionCache` Map? You're only
  using it in one place. If sessions are in cookies already, this might be
  premature optimization. Consider removing unless there's a performance reason.

**Nit:**
- Variable name `userId` - is this a string ID or a number? Type annotation
  would help here.

Overall: Good start, just clean up the error handling and reconsider if the
cache is necessary.

────────────────────────────────────────────────────────────
Provider: Ollama | Model: deepcoder
```

## Review Modes

### Default Mode

Reviews files up to a size limit, prioritizing code files (.ts, .tsx) over config/docs. Files that don't fit are skipped.

### Iterative Batch Mode (`--all`)

For large diffs, splits files into batches and reviews them iteratively:

1. Each batch is reviewed separately
2. Issues are accumulated across batches
3. A final consolidation pass groups issues by severity and gives an overall verdict

This ensures **all files get reviewed**, even if the diff is too large for a single LLM call.

### Untracked Files (`--untracked`)

By default, only tracked files (staged/unstaged changes) are reviewed. Use `--untracked` to also include new files that haven't been added to git yet.

## Customization

### Changing the reviewer name

Edit `src/core/config.ts` to change who the "reviewer" is:

```ts
export const REVIEWER_NAME = "John Doe"; // Your annoying teammate's name
```

### Changing the personality

Edit `src/core/config.ts` to customize the reviewer's tone, pet peeves, and catchphrases:

```ts
export const REVIEWER_PERSONALITY_CUSTOMIZATION = `
You are ${REVIEWER_NAME}, a senior developer known for thorough but fair code reviews.

Your review style:
- Direct and concise - no fluff, get to the point
- Uses dry humor sparingly ("This works, but future-you will hate past-you for it")
- Acknowledges good code briefly ("Nice use of early returns here")
- When there's nothing wrong, just says "Looks good! 🎉" - never invents issues

Your pet peeves (flag these when you see them):
- Overly clever code that's hard to read
- Missing error handling for things that can fail
- Magic numbers without explanation

Your catchphrases:
- "This could bite us later..."
- "Have you considered...?"
- "Nitpick, but..."
`;
```

#### Example personalities

**Strict senior dev:**

```ts
export const REVIEWER_PERSONALITY_CUSTOMIZATION = `
You are a strict senior developer.

Your review style:
- Has high standards and doesn't let things slide
- Is direct but not mean
- Explains the "why" behind every suggestion

Your pet peeves:
- Any code without tests
- Unclear variable names
- Missing type annotations

Your catchphrases:
- "This could be cleaner..."
- "In production, this will..."
- "Let's think about edge cases..."
`;
```

**Example output (strict mode):**

````
Reviewing this code:
```ts
const data = await fetch('/api/users');
````

Review:

> "This variable name 'data' is criminally vague. What kind of data? User data?
> Configuration? The void itself? And where's your error handling? fetch() can
> fail in ~12 different ways. At minimum wrap this in try/catch and handle
> network errors, timeouts, and non-200 responses. In production, this will
> crash your app the first time the API hiccups."

````

**The friendly mentor:**
```ts
export const REVIEWER_PERSONALITY_CUSTOMIZATION = `
You are a friendly mentor who loves teaching.

Your review style:
- Explains the "why" behind suggestions
- Acknowledges what's done well before critiquing
- Uses encouraging language

Your pet peeves:
- None really - you see everything as a learning opportunity

Your catchphrases:
- "Great start! One thing to consider..."
- "I learned this the hard way..."
- "Pro tip: ..."
`;
````

**Example output (friendly mentor mode):**

````
Reviewing this code:
```ts
const data = await fetch('/api/users');
````

Review:

> "Nice! You're using async/await, which is way more readable than .then() chains.
> Great start! One thing to consider: fetch() doesn't throw on HTTP errors like 404
> or 500 (it only throws on network failures). Pro tip: add a check like
> `if (!response.ok) throw new Error(...)` after the fetch. I learned this the hard
> way when a 500 error silently broke my app in production. 😅"

````

**The annoying teammate:**
```ts
export const REVIEWER_PERSONALITY_CUSTOMIZATION = `
You are that one teammate who's technically correct but slightly annoying about it.

Your review style:
- Always finds something to nitpick
- Overly thorough to the point of being pedantic
- References obscure best practices

Your pet peeves:
- Literally everything that isn't "perfect"
- Any deviation from the style guide
- Missing Oxford commas in comments

Your catchphrases:
- "Actually..."
- "In my experience..."
- "Well, technically..."
- "Not to be that guy, but..."
`;
````

**Example output (annoying teammate mode):**

````
Reviewing this code:
```ts
const data = await fetch('/api/users');
````

Review:

> "Actually, the variable name 'data' is a code smell. According to Clean Code by
> Robert C. Martin (page 18, if you haven't read it), variable names should reveal
> intent. What kind of data? User data? Also, you're not handling the Response object
> correctly (technically, you need to call .json() on it). Well, technically, fetch()
> returns a Promise<Response>, not the data itself. And while we're at it, there's
> no error handling. In my experience, unhandled promise rejections are responsible
> for 73% of production issues (citation needed). Not to be that guy, but... have
> you considered using axios instead? It has better TypeScript support."

````

### Changing what gets enforced

Edit `src/core/prompts.ts` to adjust:

- `PROJECT_STANDARDS` - Project-specific rules to enforce

## Environment Variables

You can configure the tool using environment variables. The tool automatically loads a `.env` file from the project root if present. Copy `.env.example` to `.env` and customize:

```bash
cp .env.example .env
````

### Provider Selection

| Variable       | Description          | Default  |
| -------------- | -------------------- | -------- |
| `LLM_PROVIDER` | Default LLM provider | `ollama` |

### Ollama

| Variable               | Description    | Default                  |
| ---------------------- | -------------- | ------------------------ |
| `OLLAMA_BASE_URL`      | Ollama API URL | `http://localhost:11434` |
| `OLLAMA_DEFAULT_MODEL` | Default model  | `deepcoder`              |

### Claude (Anthropic)

| Variable               | Description       | Default                      |
| ---------------------- | ----------------- | ---------------------------- |
| `ANTHROPIC_API_KEY`    | Anthropic API key | Required                     |
| `CLAUDE_DEFAULT_MODEL` | Default model     | `claude-sonnet-4-5-20250929` |

### OpenAI

| Variable               | Description                                   | Default                     |
| ---------------------- | --------------------------------------------- | --------------------------- |
| `OPENAI_API_KEY`       | OpenAI API key                                | Required                    |
| `OPENAI_BASE_URL`      | API URL (for Azure OpenAI or compatible APIs) | `https://api.openai.com/v1` |
| `OPENAI_DEFAULT_MODEL` | Default model                                 | `gpt-4.1`                   |

### Gemini (Google)

| Variable               | Description       | Default            |
| ---------------------- | ----------------- | ------------------ |
| `GOOGLE_AI_API_KEY`    | Google AI API key | Required           |
| `GEMINI_API_KEY`       | Alias for above   | -                  |
| `GEMINI_DEFAULT_MODEL` | Default model     | `gemini-2.5-flash` |

### Review Settings

| Variable            | Description                                       | Default  |
| ------------------- | ------------------------------------------------- | -------- |
| `REVIEW_STRICTNESS` | Review strictness level (lenient, normal, strict) | `normal` |

### Example usage

```bash
# Use a remote Ollama instance
OLLAMA_BASE_URL=http://192.168.1.100:11434 npm run review

# Change default model without CLI flag
OLLAMA_DEFAULT_MODEL=qwen3 npm run review

# Use Claude by default
LLM_PROVIDER=claude npm run review

# Use OpenAI with a specific model
OPENAI_DEFAULT_MODEL=gpt-4.1-mini npm run review -- --provider openai
```

## Troubleshooting

### "Ollama is not running"

Make sure you started Ollama:

```bash
ollama serve
```

### "Model X is not available"

Pull the model first:

```bash
ollama pull deepcoder
```

### Slow responses

- Smaller models are faster: try `qwen3:7b` instead of larger variants
- First run downloads the model (can take a while)
- Review fewer files at once for faster feedback

### Model gives irrelevant output (mentions security audits, vulnerabilities, etc.)

Some models hallucinate generic advice instead of reviewing the actual diff. Solutions:

1. **Try qwen3** - it follows formatting instructions more reliably: `--model qwen3`
2. **Make sure there's actually a diff** - run `git diff HEAD` to verify
3. **Review smaller changes** - large diffs can confuse the model

### Reviews are generic or irrelevant

The model might be struggling with:

- Very large diffs (try reviewing smaller changes)
- Unfamiliar frameworks (some models have better domain knowledge)
- Unclear code (even humans would struggle)

Solutions:

- Try a different model: `--model qwen3`
- Split into smaller reviews
- Use cloud models for complex diffs

## Known Issues & Roadmap

**Current Limitations:**

- No support for monorepo diffs (cross-package context)
- Token budgeting is basic (prioritizes .ts over .md arbitrarily)
- Consolidation pass sometimes loses nuance
- Model-specific quirks (some models hallucinate more than others)

**Planned Improvements:**

- [ ] Custom prompt templates
- [ ] Better handling of large diffs
- [ ] Persistent review history
- [ ] Configurable strictness levels

<!-- See [issues](https://github.com/emiliodominguez/annoying-teammate-reviewer/issues) for full list. -->

## Limitations & Accuracy

**Review Accuracy Disclaimer:** Code reviews generated by this tool **may be inaccurate, incomplete, or misleading**. Review quality depends on many factors including:

- **Model choice** - Different models have varying capabilities; smaller/local models may hallucinate or miss issues
- **Context limitations** - LLMs have token limits and may not see your entire codebase
- **Prompt sensitivity** - Results can vary based on personality settings and prompt configurations
- **Model temperature** - Non-deterministic outputs mean the same code may get different reviews
- **Domain knowledge** - Models may lack expertise in specialized frameworks or languages

**🤖 Hallucination Warning:** LLMs can and do "hallucinate" (they may invent issues that don't exist, reference files or line numbers that aren't real, suggest fixes for non-existent problems, or confidently state incorrect information). If a review mentions something that doesn't match your code, verify it manually.

**Always use human judgment.** This tool is meant to assist, not replace, proper code review. Never blindly accept or reject code based solely on AI-generated feedback.

## Learning Goals

This project explores:

- **Prompt Engineering** - Persona design, system prompts, output formatting, and how to guide LLM responses
- **LLM Integration Patterns** - Building provider-agnostic AI applications with multiple backends
- **AI Tooling Development** - Creating practical developer tools powered by LLMs
- **Plugin Architecture** - Dynamic module loading and extensibility for AI providers

## Code Architecture

The codebase is heavily commented to explain AI concepts as they appear:

| Directory        | Purpose                              | AI Concepts Covered                            |
| ---------------- | ------------------------------------ | ---------------------------------------------- |
| `src/core/`      | Core logic (prompts, config, review) | Persona prompting, instruction design, context |
| `src/providers/` | LLM provider implementations         | API integration, streaming, token management   |
| `src/plugins/`   | Plugin system                        | Dynamic provider loading, extensibility        |
| `src/utils/`     | Utilities (git, formatting)          | Context preparation, output parsing            |

## Contributing

This is a learning project, but contributions are welcome:

- **Bug fixes** - If you find something broken, please open an issue or PR
- **New providers** - Want to add support for another LLM? Check `src/providers/`
- **Documentation** - Improvements to AI concept explanations always appreciated
- **Tests** - More test coverage is always good

### Development Setup

```bash
# Clone and install
git clone https://github.com/emiliodominguez/annoying-teammate-reviewer.git
cd annoying-teammate-reviewer
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Lint and format
npm run lint:fix
npm run format

# Commit using commitizen (interactive)
npm run commit
```

### Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/). Commits are enforced via commitlint and husky hooks.

```
type(scope): subject

# Types: feat, fix, refactor, test, docs, chore, style, perf, ci, build, revert
# Scopes: core, providers, plugins, utils, cli, deps, config
```

## License

MIT
