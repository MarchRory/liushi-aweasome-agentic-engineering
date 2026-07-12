import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
import jsdoc from "eslint-plugin-jsdoc";
import tseslint from "typescript-eslint";

const typescriptFiles = ["packages/**/*.ts", "packages/**/*.tsx"];

const documentedTypeContexts = [
  "TSInterfaceDeclaration",
  "TSTypeAliasDeclaration",
  "TSEnumDeclaration",
  "TSEnumMember",
];

export default tseslint.config(
  {
    ignores: ["**/coverage/**", "**/dist/**", "**/generated/**", "**/node_modules/**"],
  },
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    ...eslint.configs.recommended,
  },
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: typescriptFiles,
  })),
  {
    files: typescriptFiles,
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["packages/*/tsup.config.ts"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      jsdoc,
    },
    settings: {
      jsdoc: {
        mode: "typescript",
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-exports": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/only-throw-error": "error",
      "@typescript-eslint/prefer-enum-initializers": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "jsdoc/require-description": "error",
      "jsdoc/require-jsdoc": [
        "error",
        {
          contexts: documentedTypeContexts,
          require: {
            ArrowFunctionExpression: false,
            ClassDeclaration: false,
            ClassExpression: false,
            FunctionDeclaration: false,
            FunctionExpression: false,
            MethodDefinition: false,
          },
        },
      ],
      "no-console": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSUnionType > TSLiteralType",
          message:
            "Closed value sets must use a documented string enum instead of a literal union.",
        },
      ],
    },
  },
  {
    files: [
      "packages/*/src/infrastructure/observability/**/*.ts",
      "packages/*/src/presentation/**/*.ts",
    ],
    rules: {
      "no-console": "off",
    },
  },
  {
    files: ["packages/*/src/domain/**/*.ts", "packages/*/src/application/**/*.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "process",
          message:
            "Domain and Application must receive runtime values through ports or input DTOs.",
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["node:*", "**/infrastructure/**", "**/presentation/**", "**/bootstrap/**"],
              message: "Domain and Application cannot depend on I/O or outer architecture layers.",
            },
          ],
        },
      ],
    },
  },
  prettier,
);
