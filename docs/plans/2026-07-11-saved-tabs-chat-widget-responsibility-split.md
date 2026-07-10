# SavedTabsChatWidget Responsibility Split Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split `SavedTabsChatWidget` into a thin composition component, a controller hook, focused browser-I/O hooks, and view-only panel components without changing behavior.

**Architecture:** Keep streaming and conversation lifecycle semantics in one controller while extracting resize, clipboard, and Ollama model settings into hooks that own their effects and cleanup. Keep Header, Composer, and Panel presentational: they receive values and callbacks and do not access Chrome storage, runtime ports, or settings persistence.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, WXT, Chrome Extension APIs, Sonner

---

### Task 1: Extract sidebar resize lifecycle

**Files:**

- Create: `src/features/ai-chat/hooks/useChatSidebarResize.test.ts`
- Create: `src/features/ai-chat/hooks/useChatSidebarResize.ts`
- Modify: `src/features/ai-chat/components/SavedTabsChatWidget.tsx`

**Step 1: Write the failing hook test**

Add focused tests that render the hook with injected width persistence and verify:

- stored width is restored and clamped
- pointer movement updates width
- pointer up persists width and restores the original body style
- unmount removes listeners and restores body style
- page mode does not register resize behavior

The first test must import `useChatSidebarResize` from the new module so it fails before implementation.

**Step 2: Run the test to verify RED**

Run: `bunx vitest run --config vitest.ci.config.ts src/features/ai-chat/hooks/useChatSidebarResize.test.ts`

Expected: FAIL because `useChatSidebarResize` does not exist.

**Step 3: Implement the resize hook**

Move width state, viewport width, pointer listeners, body-style restoration, `loadSidebarWidth`, and `persistSidebarWidth` ownership into the hook. Return `sidebarWidth`, `isResizing`, `isCompactLayout`, `cardStyle`, and `handleResizeStart`.

Do not add a wrapper around the old widget handlers; delete their old ownership after the hook is connected.

**Step 4: Run focused and widget tests to verify GREEN**

Run: `bunx vitest run --config vitest.ci.config.ts src/features/ai-chat/hooks/useChatSidebarResize.test.ts src/features/ai-chat/components/SavedTabsChatWidget.test.tsx`

Expected: PASS with no warnings.

**Step 5: Commit**

```bash
git add src/features/ai-chat/hooks/useChatSidebarResize.ts src/features/ai-chat/hooks/useChatSidebarResize.test.ts src/features/ai-chat/components/SavedTabsChatWidget.tsx
git commit -m "チャットサイドバーのリサイズ責務をhookへ分離する"
```

### Task 2: Extract conversation clipboard lifecycle

**Files:**

- Create: `src/features/ai-chat/hooks/useConversationClipboard.test.ts`
- Create: `src/features/ai-chat/hooks/useConversationClipboard.ts`
- Modify: `src/features/ai-chat/components/SavedTabsChatWidget.tsx`

**Step 1: Write the failing hook test**

Add tests for successful copy, missing Clipboard API, rejected writes, copied timeout reset, and timeout cleanup on unmount. Use fake timers only for the icon timeout.

**Step 2: Run the test to verify RED**

Run: `bunx vitest run --config vitest.ci.config.ts src/features/ai-chat/hooks/useConversationClipboard.test.ts`

Expected: FAIL because the hook module does not exist.

**Step 3: Implement the clipboard hook**

Move capability-safe Clipboard API lookup, conversation text generation, toast handling, copied state, timeout replacement, and unmount cleanup into the hook. Return `isConversationCopied` and `copyConversation`.

Delete the old clipboard writer, timeout ref, and handler from the widget after connecting the hook.

**Step 4: Run focused and widget tests to verify GREEN**

Run: `bunx vitest run --config vitest.ci.config.ts src/features/ai-chat/hooks/useConversationClipboard.test.ts src/features/ai-chat/components/SavedTabsChatWidget.test.tsx`

Expected: PASS with the existing copy button behavior unchanged.

**Step 5: Commit**

```bash
git add src/features/ai-chat/hooks/useConversationClipboard.ts src/features/ai-chat/hooks/useConversationClipboard.test.ts src/features/ai-chat/components/SavedTabsChatWidget.tsx
git commit -m "会話コピーのライフサイクルをhookへ分離する"
```

### Task 3: Extract Ollama model settings

**Files:**

- Create: `src/features/ai-chat/hooks/useOllamaModelSettings.test.ts`
- Create: `src/features/ai-chat/hooks/useOllamaModelSettings.ts`
- Modify: `src/features/ai-chat/components/SavedTabsChatWidget.tsx`

**Step 1: Write the failing hook test**

Add tests for model fetch success, model fetch errors, model save success, save errors, duplicate in-flight actions, and platform-specific error details.

**Step 2: Run the test to verify RED**

Run: `bunx vitest run --config vitest.ci.config.ts src/features/ai-chat/hooks/useOllamaModelSettings.test.ts`

Expected: FAIL because the hook module does not exist.

**Step 3: Implement the model settings hook**

Move model options, loading/saving state, setup errors, runtime platform, model fetching, and selected-model persistence into the hook. Accept normalized settings and an `onSettingsSaved` callback so the controller remains responsible for conversation reset semantics.

Delete the old model handlers and state from the widget after connecting the hook.

**Step 4: Run focused and widget tests to verify GREEN**

Run: `bunx vitest run --config vitest.ci.config.ts src/features/ai-chat/hooks/useOllamaModelSettings.test.ts src/features/ai-chat/components/SavedTabsChatWidget.test.tsx`

Expected: PASS with fetch, selection, and platform guidance unchanged.

**Step 5: Commit**

```bash
git add src/features/ai-chat/hooks/useOllamaModelSettings.ts src/features/ai-chat/hooks/useOllamaModelSettings.test.ts src/features/ai-chat/components/SavedTabsChatWidget.tsx
git commit -m "Ollamaモデル設定を専用hookへ分離する"
```

### Task 4: Extract view-only Header and Composer

**Files:**

- Create: `src/features/ai-chat/components/SavedTabsChatHeader.test.tsx`
- Create: `src/features/ai-chat/components/SavedTabsChatHeader.tsx`
- Create: `src/features/ai-chat/components/SavedTabsChatComposer.test.tsx`
- Create: `src/features/ai-chat/components/SavedTabsChatComposer.tsx`
- Modify: `src/features/ai-chat/components/SavedTabsChatWidget.tsx`

**Step 1: Write failing component tests**

Add direct rendering tests that cover Header actions and Composer input/model/submit rendering. Mock leaf UI components only where browser behavior is irrelevant. Assert that callbacks are invoked and that the component modules do not require storage or runtime mocks.

**Step 2: Run the tests to verify RED**

Run: `bunx vitest run --config vitest.ci.config.ts src/features/ai-chat/components/SavedTabsChatHeader.test.tsx src/features/ai-chat/components/SavedTabsChatComposer.test.tsx`

Expected: FAIL because the view components do not exist.

**Step 3: Implement Header and Composer**

Move existing JSX and view-only memoization into the two components. Define explicit props containing values and callbacks only. Preserve DOM order, test ids, accessible names, narrow-layout behavior, and system-prompt/history interactions.

**Step 4: Run component and widget tests to verify GREEN**

Run: `bunx vitest run --config vitest.ci.config.ts src/features/ai-chat/components/SavedTabsChatHeader.test.tsx src/features/ai-chat/components/SavedTabsChatComposer.test.tsx src/features/ai-chat/components/SavedTabsChatWidget.test.tsx`

Expected: PASS with no DOM or accessibility regressions.

**Step 5: Commit**

```bash
git add src/features/ai-chat/components/SavedTabsChatHeader.tsx src/features/ai-chat/components/SavedTabsChatHeader.test.tsx src/features/ai-chat/components/SavedTabsChatComposer.tsx src/features/ai-chat/components/SavedTabsChatComposer.test.tsx src/features/ai-chat/components/SavedTabsChatWidget.tsx
git commit -m "チャットのHeaderとComposerを表示componentへ分離する"
```

### Task 5: Extract the view-only Panel

**Files:**

- Create: `src/features/ai-chat/components/SavedTabsChatPanel.test.tsx`
- Create: `src/features/ai-chat/components/SavedTabsChatPanel.tsx`
- Modify: `src/features/ai-chat/components/SavedTabsChatWidget.tsx`

**Step 1: Write the failing Panel test**

Add tests for page and floating shells, resize handle wiring, conversation empty/content rendering, and bottom-dock composition.

**Step 2: Run the test to verify RED**

Run: `bunx vitest run --config vitest.ci.config.ts src/features/ai-chat/components/SavedTabsChatPanel.test.tsx`

Expected: FAIL because `SavedTabsChatPanel` does not exist.

**Step 3: Implement the Panel**

Move the panel JSX and message rendering helpers into the Panel module. Keep the component view-only and preserve page/floating layout differences. Header and Composer remain child components rather than render-function wrappers.

**Step 4: Run Panel and widget tests to verify GREEN**

Run: `bunx vitest run --config vitest.ci.config.ts src/features/ai-chat/components/SavedTabsChatPanel.test.tsx src/features/ai-chat/components/SavedTabsChatWidget.test.tsx`

Expected: PASS with page and floating layouts unchanged.

**Step 5: Commit**

```bash
git add src/features/ai-chat/components/SavedTabsChatPanel.tsx src/features/ai-chat/components/SavedTabsChatPanel.test.tsx src/features/ai-chat/components/SavedTabsChatWidget.tsx
git commit -m "チャットPanelを表示componentへ分離する"
```

### Task 6: Extract the controller and thin the Widget

**Files:**

- Create: `src/features/ai-chat/hooks/useSavedTabsChatController.test.ts`
- Create: `src/features/ai-chat/hooks/useSavedTabsChatController.ts`
- Modify: `src/features/ai-chat/components/SavedTabsChatWidget.tsx`
- Modify: `src/features/ai-chat/components/SavedTabsChatWidget.test.tsx`

**Step 1: Write the failing controller test**

Add tests for external conversation synchronization, `onMessagesChange` notification timing, reset/disconnect behavior, storage setting updates, and generation-token protection against stale streaming callbacks.

**Step 2: Run the test to verify RED**

Run: `bunx vitest run --config vitest.ci.config.ts src/features/ai-chat/hooks/useSavedTabsChatController.test.ts`

Expected: FAIL because the controller hook does not exist.

**Step 3: Implement the controller**

Move remaining non-view state, effects, refs, and actions into `useSavedTabsChatController`. Compose the three focused hooks and existing prompt/stream hooks. Return a semantic view model plus actions; do not return JSX or expose runtime ports.

Reduce `SavedTabsChatWidget` to controller invocation, floating launcher composition, and `SavedTabsChatPanel` prop wiring.

**Step 4: Run controller and widget tests to verify GREEN**

Run: `bunx vitest run --config vitest.ci.config.ts src/features/ai-chat/hooks/useSavedTabsChatController.test.ts src/features/ai-chat/components/SavedTabsChatWidget.test.tsx`

Expected: PASS, including stream-step notification and disconnect regression cases.

**Step 5: Commit**

```bash
git add src/features/ai-chat/hooks/useSavedTabsChatController.ts src/features/ai-chat/hooks/useSavedTabsChatController.test.ts src/features/ai-chat/components/SavedTabsChatWidget.tsx src/features/ai-chat/components/SavedTabsChatWidget.test.tsx
git commit -m "SavedTabsChatWidgetを薄いcomposition componentにする"
```

### Task 7: Verify architecture and regressions

**Files:**

- Modify as required by diagnostics: only files introduced or changed in Tasks 1-6

**Step 1: Format and compile**

Run: `bun run format`

Expected: PASS after formatting intended files only.

Run: `bun run compile`

Expected: PASS with zero type errors.

**Step 2: Run focused DOM and full tests**

Run: `bun run test:dom`

Expected: PASS.

Run: `bun run test`

Expected: PASS with zero failures.

**Step 3: Prove coverage**

Run: `bun run test:coverage`

Expected: PASS and report 100% statements, branches, functions, and lines.

**Step 4: Run React and repository diagnostics**

Run: `rtk bun run doctor -- --verbose --scope changed --base origin/develop`

Expected: 100/100 with no diagnostics for changed files.

Run: `bun run quality`

Expected: PASS for format, lint, compile, test, Knip, duplication, architecture, and project gates.

**Step 5: Validate harness evidence**

Run: `bun run harness:validate`

Expected: PASS.

Run: `bun run harness:audit`

Expected: no unresolved blocker or missing required evidence.

**Step 6: Commit verification fixes if any**

```bash
git add <only-files-fixed-by-verification>
git commit -m "Issue 654の品質検証指摘を解消する"
```

### Task 8: Review and publish

**Files:**

- Review: all files in `git diff origin/develop...HEAD`

**Step 1: Request code review**

Review the completed diff against Issue #654 acceptance criteria. Fix Critical and Important findings, then rerun the affected focused tests and the final quality gates.

**Step 2: Confirm publication scope**

Run: `git status --short --branch`

Expected: clean branch with only intended commits ahead of `origin/develop`.

**Step 3: Push the branch**

Run: `git push -u origin codex/issue-654-split-saved-tabs-chat-widget`

Expected: branch published successfully.

**Step 4: Open the PR**

Create a PR targeting `develop`, summarize responsibility boundaries and regression proof, include the exact validation commands, and add `closes #654`.
