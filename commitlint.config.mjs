/** @type {import("@commitlint/types").UserConfig} */
export default {
	extends: ["@commitlint/config-conventional"],
	rules: {
		"type-enum": [2, "always", ["feat", "fix", "refactor", "test", "docs", "chore", "style", "perf", "ci", "build", "revert"]],
		"scope-enum": [2, "always", ["core", "providers", "plugins", "utils", "cli", "deps", "config"]],
		"scope-empty": [1, "never"],
		"subject-case": [2, "always", "lower-case"],
		"subject-empty": [2, "never"],
		"subject-full-stop": [2, "never", "."],
		"header-max-length": [2, "always", 100],
		"body-max-line-length": [2, "always", 200],
	},
};
