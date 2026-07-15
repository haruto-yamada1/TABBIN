# Commit Push PR Issue-to-PR Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `commit-push-pr` plus a GitHub Issue URL sufficient to complete Issue intake, root-cause implementation, verification, commit, push, and an Open PR to `develop`.

**Architecture:** Keep `commit-push-pr` as the user-facing orchestrator and publish phase. Reuse `github-issue-implementation` as a non-circular intake and implementation phase, while keeping stable repository defaults in APM instructions and generated artifacts synchronized through APM.

**Tech Stack:** Markdown Agent Skills, APM CLI, shell-based repository gates, Git, GitHub CLI.

---

### Task 1: Record the Current Skill Failure

**Files:**
- Read: `.apm/skills/commit-push-pr/SKILL.md`
- Read: `.apm/skills/github-issue-implementation/SKILL.md`
- Create: `/tmp/commit-push-pr-red.txt`

**Step 1: Prepare the pressure scenario**

Ask a fresh subagent to follow the current `commit-push-pr` skill with only:

```text
$commit-push-pr
https://github.com/haruto-yamada1/TABBIN/issues/646

Do not mutate the repository or GitHub. Explain the actions you would take and where the skill tells you to stop.
```

**Step 2: Run the scenario and verify RED**

Expected failure: the agent treats the workflow as publish-only or stops because no implementation changes exist; it does not derive the complete Issue-to-Open-PR contract from `commit-push-pr` alone.

**Step 3: Record the failure**

Write the observed decision and rationalization to `/tmp/commit-push-pr-red.txt`. Do not edit the skill before this evidence exists.

### Task 2: Refactor the Skill Responsibilities

**Files:**
- Modify: `.apm/skills/commit-push-pr/SKILL.md`
- Modify: `.apm/skills/github-issue-implementation/SKILL.md`

**Step 1: Update the entrypoint frontmatter**

Make `commit-push-pr` discoverable for both implementation-complete publishing and Issue URL requests. Keep the description limited to triggering conditions.

**Step 2: Add explicit dispatch modes**

Define:

```text
Issue URL present -> run github-issue-implementation phase -> publish phase
No Issue URL, changes present -> publish phase
Neither URL nor changes -> stop with evidence
```

**Step 3: Encode the Issue contract**

Require live Issue body, comments, linked Issue / PR intake before editing. Require root-cause analysis, existing design/source inspection, TDD where behavior changes, narrow scope, runtime verification, and blocker-only interruption.

**Step 4: Encode verification and publishing**

Require targeted tests, `bun run quality:check`, clean-tree `bun run release:check`, scoped staging, Japanese commit/title, push synchronization, and an Open PR to `develop` with cause, solution, changes, risk, commands, and acceptance-criteria mapping.

**Step 5: Remove the circular handoff**

Make `github-issue-implementation` return a structured implementation result to its caller. If invoked standalone, it may recommend `commit-push-pr`, but it must not recursively invoke it when already running as its phase.

### Task 3: Align Repository Source of Truth

**Files:**
- Modify: `.apm/SKILLS.md`
- Modify: `.apm/instructions/repository-guidelines.instructions.md`
- Generated: `.agents/skills/commit-push-pr/SKILL.md`
- Generated: `.agents/skills/github-issue-implementation/SKILL.md`
- Generated: `AGENTS.md`

**Step 1: Update the skill catalog**

Document `commit-push-pr` as the single Issue-to-Open-PR entrypoint and `github-issue-implementation` as its reusable implementation phase.

**Step 2: Resolve stable instruction drift**

Change the repository PR target from `main` to `develop`. Name `bun run quality:check` as the broad gate and document that `release:check` requires a clean tree.

**Step 3: Compile generated artifacts**

Run:

```bash
apm compile --validate
```

Expected: exit 0; generated `.agents` skills and root instruction artifacts match `.apm` sources.

**Step 4: Inspect generated scope**

Run:

```bash
rtk git status --short
rtk git diff --stat
```

Expected: only intended source files, generated counterparts, and plan documents are changed.

### Task 4: Verify Skill Behavior

**Files:**
- Create: `/tmp/commit-push-pr-green.txt`
- Create: `/tmp/commit-push-pr-review.txt`

**Step 1: Re-run the original pressure scenario**

Ask a fresh subagent to use the updated skill with the same Issue URL and no extra prompt. It must not mutate state.

Expected: it plans live Issue intake, implementation phase, root-cause/TDD checks, full verification, scoped commit/push, and Open PR creation without requiring the long user prompt.

**Step 2: Run variation scenarios**

Verify at least:

- existing changes without an Issue URL use publish-only mode;
- unavailable Issue intake stops before implementation;
- release check is scheduled after a clean checkpoint commit;
- unrelated dirty files are not staged;
- PR is Open and targets `develop`.

**Step 3: Perform fresh-context review**

Ask a reviewer subagent to compare the updated skill and generated instructions against the approved design. Fix all Critical and Important findings, then repeat the relevant scenario.

### Task 5: Run Repository Gates

**Files:**
- Verify all changed files

**Step 1: Run format and APM validation**

Run:

```bash
apm compile --validate
bun run format:check
```

Expected: both exit 0.

**Step 2: Run the broad quality gate**

Run:

```bash
rtk bun run quality:check
```

Expected: exit 0 with no failing sub-gate.

**Step 3: Commit the implementation checkpoint**

Stage only the intended files and commit with a concise Japanese message.

**Step 4: Run the clean-tree release gate**

Run:

```bash
rtk bun run release:check
```

Expected: exit 0 and `rtk git status --short` remains clean.

### Task 6: Publish an Open PR

**Files:**
- No additional repository files

**Step 1: Push the branch**

Run:

```bash
git push -u origin codex/improve-commit-push-pr
```

Expected: push succeeds and the local branch tracks the remote branch.

**Step 2: Create the PR**

Create a non-draft PR to `develop`. The body must include the original problem, root cause, chosen design, changed files, regression risks, all verification commands, and how the requested short invocation is satisfied.

**Step 3: Verify remote state**

Confirm the PR is `OPEN`, not draft, targets `develop`, and the branch is synchronized with origin.
