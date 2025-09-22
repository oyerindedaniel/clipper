import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      // Exclude compiled output directories
      "dist/**/*",
      "out/**/*",
      ".next/**/*",
      "release/**/*",
      // Exclude compiled JavaScript files that are generated from TypeScript
      "src/**/*.js",
      "electron/**/*.js",
      // Exclude node_modules and other build artifacts
      "node_modules/**/*",
      "*.config.js",
      "*.config.mjs",
    ],
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "react/no-unescaped-entities": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "@next/next/no-img-element": "warn",

      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // Allow require() imports in compiled files and specific contexts
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];

export default eslintConfig;
