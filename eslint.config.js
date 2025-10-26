// @ts-check
import js from "@eslint/js";
import tsEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import importPlugin from "eslint-plugin-import";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import unusedImports from "eslint-plugin-unused-imports";
import globals from "globals";

export default [
	{
		ignores: [
			"**/.next/**",
			"**/dist/**",
			"**/.turbo/**",
			"**/dev-dist/**",
			"**/coverage/**",
			"**/node_modules/**",
			"**/__tests__/**",
			"**/*.test.{ts,tsx}",
			"**/*.spec.{ts,tsx}",
			"vitest.config.ts",
		],
	},
	js.configs.recommended,
	// (Global rule sets follow in subsequent objects)
	{
		files: ["**/*.{ts,tsx}"],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				project: ["./tsconfig.json"],
				// Use process.cwd() to avoid relying on global URL in this module context
				tsconfigRootDir: process.cwd(),
			},
			globals: {
				...globals.browser,
				...globals.node,
				// (URL global provided by runtime; explicit not needed here)
			},
		},
		plugins: {
			react: reactPlugin,
			"react-hooks": reactHooks,
			"jsx-a11y": jsxA11y,
			import: importPlugin,
			"unused-imports": unusedImports,
			"@typescript-eslint": tsEslint,
		},
		settings: {
			react: { version: "detect" },
			"import/resolver": {
				typescript: {
					alwaysTryTypes: true,
				},
			},
		},
		rules: {
			// Base TS recommended sets
			...tsEslint.configs.recommended.rules,
			...tsEslint.configs["recommended-type-checked"].rules,
			"no-console": "off",
			"no-debugger": "error",
			eqeqeq: ["error", "always"],
			"no-empty": ["error", { allowEmptyCatch: true }],
			curly: ["error", "all"],
			"no-return-await": "error",
			"prefer-const": ["error", { destructuring: "all" }],
			"no-var": "error",
			"object-shorthand": ["error", "always"],
			"prefer-template": "error",
			// Disabled to maintain zero-warning baseline after repo restructuring; re-enable later if import hygiene is prioritized
			"import/order": "off",
			// Temporarily disabled due to resolver issues with flat config + TS 5.9; revisit once import plugin supports it.
			"import/no-cycle": "off",
			"import/newline-after-import": "error",
			"unused-imports/no-unused-imports": "error",
			"unused-imports/no-unused-vars": [
				"warn",
				{
					args: "after-used",
					argsIgnorePattern: "^_",
					varsIgnorePattern: "^_",
				},
			],
			"@typescript-eslint/no-unused-vars": "off",
			"@typescript-eslint/consistent-type-imports": [
				"error",
				{ fixStyle: "inline-type-imports" },
			],
			"@typescript-eslint/no-floating-promises": "error",
			"@typescript-eslint/restrict-template-expressions": [
				"error",
				{
					allowAny: false,
					allowBoolean: true,
					allowNumber: true,
					allowNullish: true,
				},
			],
			"@typescript-eslint/explicit-function-return-type": "off",
			"@typescript-eslint/no-misused-promises": [
				"error",
				{ checksVoidReturn: { attributes: false } },
			],
			"@typescript-eslint/no-non-null-assertion": "error",
			"@typescript-eslint/no-explicit-any": "warn",
			// Temporarily relax extremely strict unsafe rules until types are hardened
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-return": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			// Aggressive suppression during stabilization phase
			"@typescript-eslint/no-unnecessary-type-assertion": "off",
			"@typescript-eslint/require-await": "off",
			// TypeScript already handles undefined identifiers during type-checking
			"no-undef": "off",
			"react/react-in-jsx-scope": "off",
			"react/prop-types": "off",
			"react/jsx-boolean-value": ["error", "never"],
			"react/jsx-key": "error",
			"jsx-a11y/anchor-is-valid": "warn",
            "suggestCanonicalClasses": "off"
		},
	},

	// Ignore generated Next.js route types file triple-slash references (root after monorepo collapse)
	{
		files: ["next-env.d.ts"],
		rules: {
			"@typescript-eslint/triple-slash-reference": "off",
		},
	},
	// Legacy path (will be removed once apps/web directory deleted)
	{
		files: ["apps/web/next-env.d.ts"],
		rules: {
			"@typescript-eslint/triple-slash-reference": "off",
		},
	},
	// Config file itself: turn off no-undef (already off globally) but ensure Node globals
	{
		files: ["eslint.config.js"],
		languageOptions: {
			globals: {
				...globals.node,
			},
		},
	},
];
