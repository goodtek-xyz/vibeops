// ESLint flat config: JS recommended + typescript-eslint recommended (no type-aware rules).
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["dist/**", "node_modules/**", "templates/**"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      // New in ESLint 10 `recommended`; existing lifecycle code predates them.
      // Re-enable in a dedicated cleanup TASK (touches status / lock / new-cycle flows).
      "no-useless-assignment": "off",
      "preserve-caught-error": "off",
    },
  },
  {
    files: ["**/*.mjs", "scripts/**/*.mjs", "tests/**/*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        URL: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        Buffer: "readonly",
      },
    },
  },
);
