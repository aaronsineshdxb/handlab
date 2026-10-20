import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// eslint-config-next still ships eslintrc-style configs, so they are
// translated with FlatCompat. `next/typescript` adds @typescript-eslint rules
// (incl. no-unused-vars) on top of core-web-vitals' react-hooks + a11y check.
const compat = new FlatCompat({
  baseConfig: {},
  rootDirectory: __dirname,
});

// `^_` naming is the codebase convention for intentionally-unused args,
// vars and catch bounds (e.g. the disabled wheel handlers' `_e`).
const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    files: ["**/*.{ts,tsx,mts,mjs}"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "public/**",
      "next-env.d.ts",
      "tsconfig.tsbuildinfo",
    ],
  },
];

export default eslintConfig;
