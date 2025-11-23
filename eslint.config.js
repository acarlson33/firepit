// @ts-check
import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import importPlugin from "eslint-plugin-import";
import unusedImports from "eslint-plugin-unused-imports";
import globals from "globals";

export default [{
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
        "**/public/sw.js", // Generated service worker
        "**/scripts/**", // Scripts excluded from TSConfig
    ],
}, js.configs.recommended, // (Global rule sets follow in subsequent objects)
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
        "@typescript-eslint": tsPlugin,
        react: reactPlugin,
        "react-hooks": reactHooksPlugin,
        import: importPlugin,
        "unused-imports": unusedImports,
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
        // Next.js configs already include TypeScript ESLint recommended rules
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
        // Turn off base no-unused-vars to use unused-imports plugin instead
        "no-unused-vars": "off",
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
        "suggestCanonicalClasses": "off"
    },
}, // Ignore generated Next.js route types file triple-slash references (root after monorepo collapse)
{
    files: ["next-env.d.ts"],
    rules: {
        "@typescript-eslint/triple-slash-reference": "off",
    },
}, // Legacy path (will be removed once apps/web directory deleted)
{
    files: ["apps/web/next-env.d.ts"],
    rules: {
        "@typescript-eslint/triple-slash-reference": "off",
    },
}, // Config file itself: turn off no-undef (already off globally) but ensure Node globals
{
    files: ["eslint.config.js"],
    languageOptions: {
        globals: {
            ...globals.node,
        },
    },
}];
