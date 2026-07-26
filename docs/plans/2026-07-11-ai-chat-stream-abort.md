# AI Chat Stream Abort Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use test-driven-development to implement
> this plan task-by-task.

**Goal:** Abort the Ollama generation owned by a disconnected AI chat stream
port and suppress every late server message.

**Architecture:** The background port handler owns a request-local
`AbortController`. Its signal is threaded through `runAiChatRequest` to AI SDK
`generateText`, while the same signal guards all port writes. Existing UI port
disconnection and generation guards remain the source of truth for reset,
conversation-switch, and unmount behavior.

**Tech Stack:** TypeScript, Chrome runtime ports, AI SDK 7, ai-sdk-ollama,
Vitest, React Testing Library.

---

### Task 1: Specify the background port cancellation contract

**Files:**

- Modify: `src/lib/background/message-handler.test.ts`

1. Add a test that captures the listener registered on `port.onDisconnect` and
   the options passed to `runAiChatRequest`.
2. Start a pending request, invoke the disconnect listener, and assert that the
   passed signal becomes aborted.
3. Trigger `onStepUpdate`, resolve the request, and reject a separate request
   after disconnect; assert that no `step`, `complete`, or `error` payload is
   posted.
4. Run `bunx vitest run src/lib/background/message-handler.test.ts` and verify
   the new assertions fail because no signal is passed and writes are unguarded.

### Task 2: Specify AI SDK signal propagation

**Files:**

- Modify: `src/lib/background/ai-chat.test.ts`

1. Add an `AbortController` signal to a `runAiChatRequest` call.
2. Assert that the mocked `generateText` call contains
   `abortSignal: controller.signal`.
3. Run `bunx vitest run src/lib/background/ai-chat.test.ts` and verify the test
   fails because `generateText` does not receive the signal.

### Task 3: Implement request-local cancellation

**Files:**

- Modify: `src/lib/background/message-handler.ts`
- Modify: `src/lib/background/ai-chat.ts`

1. Extend `RunAiChatRequestOptions` with `signal?: AbortSignal`.
2. Pass `options.signal` to `generateText` as `abortSignal`.
3. Create one `AbortController` for each accepted stream `run` message.
4. Abort it from that port's disconnect listener.
5. Before each `step`, `complete`, and `error` post, return when the signal is
   aborted.
6. Run both focused tests and verify they pass without changing their expected
   behavior.

### Task 4: Verify the UI cancellation boundary

**Files:**

- Modify only if needed: `src/features/ai-chat/hooks/useSavedTabsChatController.test.tsx`
- Modify only if a test proves a defect:
  `src/features/ai-chat/components/savedTabsChat/useChatStreamHandlers.ts`

1. Confirm existing tests cover active-port disconnection on conversation
   switch, a late-resolving port after reset, and a late-resolving port after
   unmount.
2. Add only the missing assertion needed to prove that a late response cannot
   mutate the replacement conversation.
3. Run `rtk bun run test:dom` and verify the UI lifecycle tests pass.

### Task 5: Validate and publish

**Files:**

- Review all changed files against issue #663.

1. Run `rtk bun run compile`.
2. Run `rtk bun run test`.
3. Run `rtk bun run test:coverage` and require 100% for changed behavior and the
   repository's expected coverage result.
4. Run changed-scope React Doctor if React files changed.
5. Run `rtk bun run quality`.
6. Run harness validation, audit, and fresh-context evaluation.
7. Commit only issue #663 files, push the branch, and open a `develop`-targeted
   PR that closes #663.
