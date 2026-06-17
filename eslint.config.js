// ESLint flat configuration (ESLint v9+/v10). Replaces the legacy `.eslintrc.yml`.
// Lints the TypeScript source with typescript-eslint's recommended rules plus a
// couple of project preferences.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
	// Files/dirs ESLint should never look at.
	{ ignores: ["dist", "node_modules", "examples", "**/*.config.ts"] },
	// TypeScript sources: base + typescript-eslint recommended rule sets.
	{
		files: ["**/*.ts"],
		extends: [js.configs.recommended, ...tseslint.configs.recommended],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: "module",
		},
		rules: {
			"@typescript-eslint/no-explicit-any": "warn",
			"@typescript-eslint/explicit-module-boundary-types": "off",
			"no-console": "warn",
		},
	},
);
