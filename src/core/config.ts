/**
 * @fileoverview Configuration constants for the AI code reviewer.
 *
 * This file centralizes the reviewer's identity and personality. It's where
 * you customize WHO the AI pretends to be and HOW it communicates.
 *
 * ## AI Concept: Persona Configuration
 *
 * LLMs can "role-play" different personas based on how you describe them.
 * By centralizing persona config here, you can:
 * - Quickly swap between different reviewer personalities
 * - A/B test different tones (strict vs friendly)
 * - Create themed reviewers (security-focused, performance-focused, etc.)
 *
 * ## Customization Guide
 *
 * 1. Change `REVIEWER_NAME` to personalize spinner messages
 * 2. Edit `REVIEWER_PERSONALITY_CUSTOMIZATION` to change tone/focus
 * 3. Test with real diffs to see how the AI interprets your personality
 *
 * ## AI Concept: Personality vs Instructions
 *
 * There's a key distinction in prompt design:
 * - **Personality**: WHO the reviewer is (tone, quirks, catchphrases)
 * - **Instructions**: WHAT the reviewer does (format, rules, constraints)
 *
 * Personality lives here in config.ts.
 * Instructions live in prompts.ts (REVIEWER_INSTRUCTIONS).
 *
 * This separation makes it easy to change tone without affecting behavior.
 */

/**
 * The name of the reviewer persona.
 *
 * ## AI Concept: Named Personas
 *
 * Giving the AI a name helps with:
 * - **User experience**: "<REVIEWER_NAME> is reviewing..." feels more personal
 * - **Consistency**: The name can reinforce the persona in prompts
 * - **Memorability**: Users remember "that annoying <REVIEWER_NAME>" better than "the tool"
 *
 * The name appears in:
 * - Spinner text during review
 * - CLI help text
 * - The prompt itself (establishing who the AI is)
 */
export const REVIEWER_NAME = "Emi";

/**
 * Review strictness level controls how thorough and nitpicky the reviewer is.
 *
 * ## AI Concept: Behavioral Tuning via Prompt Modifiers
 *
 * Instead of completely rewriting prompts, we can inject "behavior modifiers"
 * that adjust the AI's focus and tone. This creates configurable personalities
 * from a single base prompt.
 */
export type ReviewStrictnessLevel = "lenient" | "balanced" | "strict";

/**
 * Current review strictness level.
 * Can be overridden via environment variable: REVIEW_STRICTNESS=strict
 */
const strictnessEnv = process.env.REVIEW_STRICTNESS;

export const REVIEW_STRICTNESS_LEVEL: ReviewStrictnessLevel =
	strictnessEnv === "lenient" || strictnessEnv === "balanced" || strictnessEnv === "strict" ? strictnessEnv : "balanced";

/**
 * Descriptions for each strictness level that get injected into prompts.
 */
export const STRICTNESS_DESCRIPTIONS: Record<ReviewStrictnessLevel, string> = {
	lenient: `Focus only on critical bugs, security issues, and broken functionality. Ignore style preferences and minor improvements.`,
	balanced: `Flag bugs, logic errors, and significant maintainability issues. Mention style issues only if they hurt readability.`,
	strict: `Thoroughly examine everything - bugs, potential issues, style problems, missing docs, and optimization opportunities.`,
};

/**
 * Short name for the CLI tool.
 */
export const TOOL_SHORT_NAME = "annoying-reviewer";

/**
 * Full tool description for CLI help text.
 */
export const TOOL_DESCRIPTION = `AI code reviewer that mimics ${REVIEWER_NAME}'s review style`;

/**
 * Default LLM provider to use.
 *
 * Different providers have different tradeoffs:
 *
 * | Provider | Privacy    | Cost       | Quality    | Speed      |
 * |----------|------------|------------|------------|------------|
 * | ollama   | Local      | Free       | Good       | Varies     |
 * | claude   | Cloud      | $$         | Excellent  | Fast       |
 * | openai   | Cloud      | $$         | Excellent  | Fast       |
 * | gemini   | Cloud      | $          | Very Good  | Very Fast  |
 *
 * **Privacy-first**: Use `ollama` - code never leaves your machine
 * **Quality-first**: Use `claude` - best reasoning for code review
 * **Budget-friendly**: Use `gemini` - good quality, lower cost
 *
 * Override via:
 * - Environment: `LLM_PROVIDER=claude`
 * - CLI flag: `--provider claude`
 */
export const DEFAULT_LLM_PROVIDER = process.env.LLM_PROVIDER ?? "ollama";

/**
 * Available LLM providers and their display names.
 *
 * Built-in providers are included in the package:
 * - Easier setup (just set API key)
 * - Lazy-loaded (SDK only imported when used)
 * - Consistent documentation
 *
 * Plugin providers are installed separately:
 * - For niche use cases (Azure OpenAI, AWS Bedrock)
 * - Community-contributed
 * - Can be updated independently
 */
export const BUILT_IN_PROVIDERS = ["ollama", "claude", "openai", "gemini"] as const;

export type BuiltInProvider = (typeof BUILT_IN_PROVIDERS)[number];

/**
 * The reviewer's personality and communication style.
 *
 * ## AI Concept: Persona Prompting
 *
 * This is where you define the AI's "character." The LLM will attempt to
 * embody this persona when generating responses. Key elements:
 *
 * ### 1. Role Definition
 * "You are <REVIEWER_NAME>, a senior developer..." establishes identity and expertise level.
 *
 * ### 2. Communication Style
 * "Direct and concise" / "dry humor" / "focuses on bugs over nitpicks"
 * These guide HOW the AI expresses its feedback.
 *
 * ### 3. Pet Peeves
 * Listing specific things to flag creates consistent focus areas.
 * The AI will actively look for these patterns.
 *
 * ### 4. Catchphrases
 * Specific phrases like "This could bite us later..." create memorable,
 * consistent voice. The AI will naturally incorporate these.
 *
 * ## Experimentation Ideas
 *
 * **Strict Senior Dev**:
 * ```
 * You have high standards and don't let things slide.
 * You've seen too many "temporary" hacks become permanent.
 * You're direct but not mean.
 * ```
 *
 * **Friendly Mentor**:
 * ```
 * You explain the "why" behind every suggestion.
 * You acknowledge what's done well before critiquing.
 * You use encouraging language like "Nice start! Consider..."
 * ```
 *
 * **Security-Focused**:
 * ```
 * You have a background in security and spot vulnerabilities.
 * You flag any user input that isn't validated.
 * You're paranoid about SQL injection, XSS, and auth issues.
 * ```
 *
 * ## AI Concept: Persona Leakage
 *
 * Be careful: strong personalities can "leak" into the content.
 * A grumpy persona might be too harsh. A casual persona might
 * miss serious issues. Balance personality with professionalism.
 *
 * Set to empty string for a neutral, personality-free reviewer.
 */
export const REVIEWER_PERSONALITY_CUSTOMIZATION = `
You are ${REVIEWER_NAME}, a senior developer known for thorough but fair code reviews.

Your review style:
- Direct and concise - no fluff, get to the point
- Focuses on bugs, logic errors, and maintainability over style nitpicks
- Uses dry humor sparingly ("This works, but future-you will hate past-you for it")
- Acknowledges good code briefly ("Nice use of early returns here")
- When there's nothing wrong, just says "Looks good! 🎉" - never invents issues

Your pet peeves (flag these when you see them):
- Overly clever code that's hard to read
- Missing error handling for things that can fail
- Magic numbers without explanation
- Functions doing too many things
- Copy-pasted code that should be abstracted

Your catchphrases:
- "This could bite us later..."
- "Have you considered...?"
- "Nitpick, but..."
- "Future maintainers will thank you if..."
- "I'd suggest..."
- "I'd recommend..."
`;
