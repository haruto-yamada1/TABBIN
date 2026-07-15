# GitHub PR Review Agent Configuration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a source-agnostic `github-pr-review` workflow, a validated review-learning loop, and a safe idempotent APM synchronization command, then publish an Open PR to `develop`.

**Architecture:** Keep `.apm` as the only authored agent-configuration source. Put GitHub review orchestration in a dedicated skill that reuses `receiving-code-review`, keep reusable decisions in a searchable docs index, and run APM install/compile through a repository script that copies the APM project into a scratch directory and verifies two complete deployments before touching generated surfaces.

**Tech Stack:** TypeScript, Bun, Vitest, APM CLI 0.18.0, Markdown Agent Skills, Git, GitHub CLI.

---

## Task 1: Record Baseline and APM Reproduction

**Files:**

- Read: `.apm/skills/receiving-code-review/SKILL.md`
- Read: `apm.yml`
- Create: `docs/plans/2026-07-15-github-pr-review-agent-config-design.md`

1. Run a fresh-agent pressure scenario without `github-pr-review` and record omitted live-thread, permission, and persistence rules.
2. In detached worktrees, run default dry-run, default install twice, compile alone, and explicit-target install independently.
3. Record the cleanup candidate count, final file existence, target error, changed paths, and idempotency evidence in the design.

## Task 2: Build the Safe APM Sync Command with TDD

**Files:**

- Create: `tools/scripts/sync-agent-config.test.ts`
- Create: `tools/scripts/sync-agent-config.ts`
- Create: `tools/scripts/sync-agent-config-cli.ts`
- Modify: `package.json`

1. Write tests for required artifact validation, deterministic snapshot comparison, `apm.yml`-owned target commands, and check-only mode.
2. Run `bunx vitest run tools/scripts/sync-agent-config.test.ts` and verify RED because the implementation does not exist.
3. Implement the minimum sync orchestration and exported pure helpers.
4. Re-run the targeted test and `bun run test:node`; expect PASS.

## Task 3: Add the GitHub Review Workflow and Learning Contract

**Files:**

- Create: `.apm/skills/github-pr-review/SKILL.md`
- Create: `.apm/instructions/03-github-pr-review.instructions.md`
- Create: `docs/code-review/index.md`
- Create: `docs/code-review/decision-template.md`
- Modify: `.apm/SKILLS.md`

1. Add trigger-only frontmatter for Open PR review triage, repair, push, and reply requests.
2. Specify live-state intake, latest-HEAD validation, classification, root-fix/test flow, reply permissions, forbidden GitHub actions, and persistence promotion rules.
3. Add a short common routing instruction and a searchable decision record template/index.
4. Keep CodeRabbit as an example source, not the skill identity or authority boundary.

## Task 4: Generate and Verify APM Outputs

**Files:**

- Generated: `AGENTS.md`
- Generated: `CLAUDE.md`
- Generated: `.agents/skills/github-pr-review/SKILL.md`
- Generated: other configured client surfaces

1. Run `apm compile --validate`.
2. Run `bun run apm:sync` once and record the generated diff.
3. Run it a second time and verify no additional diff.
4. Assert all required instruction and skill files exist, are non-empty, and match their APM sources where applicable.

## Task 5: Verify Behavior and Repository Gates

1. Run the updated pressure scenario with a fresh agent and compare it with the baseline.
2. Run `bun run test:coverage`; require 100% coverage.
3. Run `bun run quality:check`; require all sub-gates to pass.
4. Perform fresh-context diff review and fix all valid findings.

## Task 6: Publish

1. Stage only intended source, generated, test, and plan files.
2. Commit with a concise Japanese imperative message.
3. Run `bun run release:check` from a clean tree.
4. Push `codex/github-pr-review-agent-config`.
5. Create a non-draft Open PR to `develop` with cause, solution, scope, risks, verification, APM reproduction, and acceptance mapping.
6. Confirm PR state and branch synchronization.
