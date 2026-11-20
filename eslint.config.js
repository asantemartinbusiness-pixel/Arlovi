import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "playwright-report/**", "test-results/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.ts", "vite.config.ts", "playwright.config.ts"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      /* A hook called after an early return, or conditionally, changes the
         hook order between renders and React aborts the screen. */
      "react-hooks/rules-of-hooks": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    /* Time is read in one place. A bare clock read in application code stamps
       records with real time when the workspace clock is frozen or set, so
       the two disagree. Use clockNow() / clockIso() for "when", and wallMs()
       for ids, undo windows, playback and device diagnostics. */
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/platform/clock.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: "Read the workspace clock with clockNow() or clockIso() from @/platform/clock, not new Date().",
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: "Use clockNow() for the workspace time, or wallMs() for ids and elapsed time, from @/platform/clock.",
        },
        {
          /* A revision-checked patch resolves to null when the record changed
             elsewhere. Awaiting it as a bare statement drops that result, so a
             success message can follow a write that never happened. */
          selector: "ExpressionStatement > AwaitExpression > CallExpression[callee.property.name='patch'][callee.object.property.name='mutate']",
          message: "Check the result of mutate.patch (null means the record changed elsewhere) before reporting success.",
        },
      ],
    },
  },
);
