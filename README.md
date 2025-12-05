# Annoying Teammate Code Reviewer

AI-powered code reviewer that mimics your annoying teammate's review style. Supports multiple LLM providers: Ollama (local), Claude, OpenAI, and Gemini.

## Supported Providers

| Provider | Description                             | Requires         |
| -------- | --------------------------------------- | ---------------- |
| Ollama   | Local LLM - no data leaves your machine | Ollama installed |
| Claude   | Anthropic's Claude models               | API key          |
| OpenAI   | GPT-4o and other OpenAI models          | API key          |
| Gemini   | Google's Gemini models                  | API key          |

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
    ollama pull codellama     # Default - code-focused model
    ```

    > **Tip:** If you experience hallucination issues (model inventing files or
    > generic advice), try `llama3.2` which follows formatting instructions more
    > reliably: `ollama pull llama3.2`

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
git clone <repository-url>
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
npx tsx src/index.ts --model llama3.2
npx tsx src/index.ts --provider claude --model claude-3-opus-20240229
npx tsx src/index.ts --provider openai --model gpt-4-turbo
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

## What It Reviews

- Code changes (additions, deletions, modifications)
- Adherence to project standards (from CLAUDE.md)
- Commit message format (when using `--branch`)
- Common issues: over-engineering, security concerns, unused code

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

Edit `src/config.ts` to change who the "reviewer" is:

```ts
export const REVIEWER_NAME = "John Doe"; // Your annoying teammate's name
```

### Changing the personality

Edit `src/config.ts` to customize the reviewer's tone, pet peeves, and catchphrases:

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

Example personalities:

```ts
// Strict senior dev
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

// The friendly mentor
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

// The annoying teammate
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
```

### Changing what gets enforced

Edit `src/prompts.ts` to adjust:

- `PROJECT_STANDARDS` - Project-specific rules to enforce

### Environment variables

#### Provider Selection

| Variable       | Description          | Default  |
| -------------- | -------------------- | -------- |
| `LLM_PROVIDER` | Default LLM provider | `ollama` |

#### Ollama

| Variable               | Description    | Default                  |
| ---------------------- | -------------- | ------------------------ |
| `OLLAMA_BASE_URL`      | Ollama API URL | `http://localhost:11434` |
| `OLLAMA_DEFAULT_MODEL` | Default model  | `codellama`              |

#### Claude (Anthropic)

| Variable               | Description       | Default                    |
| ---------------------- | ----------------- | -------------------------- |
| `ANTHROPIC_API_KEY`    | Anthropic API key | Required                   |
| `CLAUDE_DEFAULT_MODEL` | Default model     | `claude-sonnet-4-20250514` |

#### OpenAI

| Variable               | Description    | Default  |
| ---------------------- | -------------- | -------- |
| `OPENAI_API_KEY`       | OpenAI API key | Required |
| `OPENAI_BASE_URL`      | OpenAI API URL | Default  |
| `OPENAI_DEFAULT_MODEL` | Default model  | `gpt-4o` |

#### Gemini (Google)

| Variable               | Description       | Default            |
| ---------------------- | ----------------- | ------------------ |
| `GOOGLE_AI_API_KEY`    | Google AI API key | Required           |
| `GEMINI_API_KEY`       | Alias for above   | -                  |
| `GEMINI_DEFAULT_MODEL` | Default model     | `gemini-2.0-flash` |

Example usage:

```bash
# Use a remote Ollama instance
OLLAMA_BASE_URL=http://192.168.1.100:11434 npm run review

# Change default model without CLI flag
OLLAMA_DEFAULT_MODEL=llama3.2 npm run review

# Use Claude by default
LLM_PROVIDER=claude npm run review

# Use OpenAI with a specific model
OPENAI_DEFAULT_MODEL=gpt-4-turbo npm run review -- --provider openai
```

## Example Output

```
📋 Reviewing: branch diff (main...HEAD)
   Branch: feature/add-user-auth
   Files: 5
   Commits:
      abc1234 feature(auth): Add login form
      def5678 feature(auth): Add session handling

🤔 Your Annoying Teammate is reviewing your code...

────────────────────────────────────────────────────────────

🔄 Would request changes

**Should fix:**
- `src/auth/login.tsx:45` - This try/catch is swallowing errors silently.
  At minimum log the error, but probably show the user something went wrong.

- `src/auth/session.ts:12` - Do we need this `sessionCache` Map? You're only
  using it in one place and the session is already in the cookie. Feels like
  premature optimization.

**Nit:**
- Commit messages look good, but "Add session handling" is a bit vague.
  What kind of handling?

Overall: Good direction, just clean up the error handling and remove that
unnecessary cache.

────────────────────────────────────────────────────────────

Review complete. Model: codellama
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
ollama pull llama3.2
```

### Slow responses

- Smaller models are faster: try `llama3.2` instead of larger variants
- First run downloads the model (can take a while)
- Review fewer files at once for faster feedback

### Model gives irrelevant output (mentions security audits, vulnerabilities, etc.)

Some models hallucinate generic advice instead of reviewing the actual diff. Solutions:

1. **Try llama3.2** - it follows formatting instructions more reliably: `--model llama3.2`
2. **Make sure there's actually a diff** - run `git diff HEAD` to verify
3. **Review smaller changes** - large diffs can confuse the model
