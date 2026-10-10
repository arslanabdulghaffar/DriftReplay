import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  js.configs.recommended,
  ...tseslint.configs.recommended,
  globalIgnores([
    "**/node_modules/**",
    "**/.next/**",
    "**/out/**",
    "**/next-env.d.ts",
    "docs/validation/**",
    ".local/**",
  ]),
  { languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  { rules: { "@typescript-eslint/no-explicit-any": "error" } },
]);
