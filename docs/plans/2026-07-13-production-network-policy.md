# Production Network Policy Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use test-driven-development and verification-before-completion task-by-task.

**Goal:** Enforce TABBIN's local-only production outbound network policy across source inventory, generated manifests, and extension E2E flows.

**Architecture:** A shared typed policy supplies Ollama's runtime origin and WXT host permissions. A TypeScript-AST verifier compares discovered call sites with a checked-in inventory and validates built manifests. The Playwright fixture attributes requests to extension pages/service workers and fails on disallowed outbound origins.

**Tech Stack:** TypeScript, WXT, TypeScript compiler API, Vitest, Playwright

---

## Task 1: Shared policy behavior

**Files:**

- Create: `src/constants/productionNetworkPolicy.test.ts`
- Create: `src/constants/productionNetworkPolicy.ts`
- Modify: `src/lib/background/ai-chat.ts`
- Modify: `wxt.config.ts`

1. Write failing tests proving loopback Ollama URLs are allowed and external,
   malformed, and non-network URLs are rejected or ignored as specified.
2. Run `bun run test:node -- src/constants/productionNetworkPolicy.test.ts` and
   confirm failure because the policy module does not exist.
3. Implement the minimal typed policy, URL classifier, Ollama base URL, and host
   permissions; replace duplicated literals in runtime and WXT configuration.
4. Run the focused test and existing `src/lib/background/ai-chat.test.ts`.

## Task 2: AST inventory and manifest verifier

**Files:**

- Create: `tools/scripts/production-network-policy.ts`
- Create: `tools/scripts/production-network-policy.test.ts`
- Create: `tools/scripts/verify-production-network-policy.ts`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

1. Write failing fixture tests for detection of `fetch`, `XMLHttpRequest`,
   `WebSocket`, `EventSource`, `navigator.sendBeacon`, and explicit network
   client imports, plus exact manifest permission comparison.
2. Add a failing live-repository test whose expected inventory contains only
   the blob conversion and `ai-sdk-ollama` import.
3. Run `bun run test:node -- tools/scripts/production-network-policy.test.ts` and
   verify the expected missing-implementation failures.
4. Implement alias-aware AST discovery, inventory comparison, exact host
   permission validation, and a fail-closed production extension CSP.
5. Add `verify:production-network-policy` after both production builds in
   `release:check` and the CI Verify Build job.
6. Re-run the focused tests and build/verifier commands.

## Task 3: Runtime request interception and security policy

**Files:**

- Create: `e2e/helpers/network-policy.ts`
- Modify: `e2e/helpers/extension.ts`
- Create: `docs/security/production-network-policy.md`

1. Add classifier tests in Task 1 that distinguish extension initiators and
   outbound schemes from browser navigation and extension resources.
2. Implement an automatic Playwright fixture that records requests initiated by
   extension frames/service workers and asserts every outbound URL is allowed.
3. Document the production inventory, allowlist, generated-manifest/runtime
   verification commands, and required security-review checklist.
4. Run `bun run build` followed by targeted or full `bun run e2e`.

## Task 4: Completion gates and publication

**Files:**

- Update harness state under `.agents/harness/` only through harness commands.

1. Run focused tests, `bun run test:coverage`, `bun run quality`, and
   `bun run release:check`; investigate any failure rather than weakening a
   gate.
2. Run React Doctor only if React production code changes beyond replacing the
   blob helper.
3. Record checkpoints, run `harness:validate`, `harness:audit`, and a
   fresh-context evaluator review.
4. Inspect the scoped diff, commit in Japanese, push
   `codex/issue-721-network-allowlist`, and create a non-draft PR to `develop`
   that closes #721 and maps each acceptance criterion to evidence. The
   `develop` base is an explicitly approved exception for this task because the
   user requested it when assigning Issue #721.
