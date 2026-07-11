# Flaky Test Investigation

TABBIN aims to keep the test baseline green. A flaky test is treated as a bug,
not as an acceptable existing issue.

## Principles

- Do not hide timing issues with arbitrary `sleep`, increased timeouts, skipped
  tests, or retry-only success.
- Fix the root cause: race conditions between async input, React state updates,
  and browser APIs are common sources.
- Record reproduction details: failing seed, iteration count, duration, and the
  exact failure message.

## Repeating a test

Use the helper script to run a single test file many times and collect a
pass/fail summary:

```bash
bun tools/scripts/test-flake.mjs --config vitest.ci.config.ts \
  src/features/options/SubCategoryKeywordManager.test.tsx \
  --repeat 100 --project dom
```

For node-project tests, override the project:

```bash
bun tools/scripts/test-flake.mjs --config vitest.ci.config.ts \
  src/lib/example.test.ts --repeat 100 --project node
```

The script runs the file once per Vitest process so each iteration starts from
a clean module state. Failures are summarized at the end.

## Case study: `SubCategoryKeywordManager` rename input

The rename input was focused and selected with `requestAnimationFrame` in the
parent component. This scheduled selection could run while `userEvent.type`
was typing in the same input, causing the first typed character to be selected
and overwritten by the next keystroke. The saved result was then missing the
first letter.

The fix moved focus and selection into the input component itself:

- The input is focused on mount with `useEffect`.
- `onFocus` selects the current value.
- The parent no longer schedules selection with `requestAnimationFrame`.

This keeps the selection deterministic and prevents it from racing with
`userEvent.type`.
