import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        ignoreRestSiblings: true,
      }],
    },
  },
  globalIgnores([
    ".agents/**",
    ".codex/**",
    ".impeccable/**",
    ".next/**",
    ".next-dev/**",
    ".collector-output/**",
    ".collector-py/**",
    ".collector-python/**",
    ".npm-cache/**",
    ".uv-cache/**",
    ".venv/**",
    "coverage/**",
    "collector/vendor/**",
    "data/**",
  ]),
]);
