---
name: cursor-sdk
description: Cursor TypeScript SDK（`@cursor/sdk`）上で app、script、CI pipeline、automation を構築するガイド。Cursor SDK の統合・インストール・コード記述、`Agent.create`、`Agent.prompt`、`Agent.resume`、`agent.send`、`run.stream`、`CursorAgentError`、`@cursor/sdk` の言及、Cursor IDE 外（script、CI/CD pipeline、GitHub Action、backend service など）から Cursor agent を programmatic に実行、local/cloud runtime 選択、SDK agent 用 MCP server 設定、streaming・cancellation・error 処理、automation/bot/REST `/v1/agents` migration への Cursor 組み込み時に使います。記憶に頼らず積極的に使ってください。SDK surface は進化し、この skill が external package の source of truth です。
---
# Cursor SDK ガイド

Cursor TypeScript SDK（`@cursor/sdk`）は Cursor agent を programmatic に実行します。同じ interface が local runtime（caller machine 上、caller file に対して）と cloud runtime（Cursor-hosted または self-hosted infrastructure、clone repo に対し PR を開く）の両方を駆動します。

この skill で **working integration を素早く bootstrap** し、**新規ユーザーが踏みがちな trap を避ける** 支援をします。canonical docs は [https://cursor.com/docs/api/sdk/typescript](https://cursor.com/docs/api/sdk/typescript)。この skill は decision-making、failure-mode prevention、ready-to-extend pattern を追加します。

## Voice and Posture

この skill はユーザーが SDK で **構築する** 支援です。SDK 選択の validate、congratulate、sell の場ではありません。user intent が input、あなたの役割は execution です。

- **ユーザーが SDK を明示的に名指し**（"Cursor SDK"、`@cursor/sdk`、`Agent.create`、`Agent.prompt` など）: SDK を知っていて使うと決めたと仮定。framing、pep talk を skip し integration 生成へ。No "good news"、no "the SDK is perfect for this"。
- **SDK に fit する問題を述べるが SDK を名指ししない**（"PR を review する bot が欲しい" など）: SDK は未確定の選択。brief に question として surface し待つ: *"The Cursor SDK is what I'd reach for here - want me to design it that way, or do you have a different runtime in mind?"* 確認後 proceed。push back や option 希望なら option を提示。
- **どちらの場合も user intent を restate しない。** 彼らは欲しいものを知っている。design へ進む。

避ける opener（および類似表現）:

- "Good news: this is exactly the pattern..."
- "The SDK is built for this shape."
- "Great, you've come to the right place."
- "This is almost exactly the X the SDK is designed for."
- user choice を compliment したり goal を flattering に restate する lede

Prefer:

- design decision または最初に知るべきことから open。
- 本当に flag する design choice（local vs cloud、prompt vs send、sync vs stream）があれば 1 文で name し reason を説明。

## 3 つの Invocation Pattern

ほぼすべての SDK integration は 3 shape の 1 つに収束。job に fit する 1 つを選び、混ぜない。

### 1. `Agent.prompt(...)` - one-shot

```typescript
import { Agent } from "@cursor/sdk";

const result = await Agent.prompt("Refactor src/utils.ts for readability", {
  apiKey: process.env.CURSOR_API_KEY!,
  model: { id: "composer-2" },
  local: { cwd: process.cwd() },
});
console.log(result.status, result.result);
```

fire-and-forget script、GitHub Actions step、「prompt を送って result を得て exit」の flow に。streaming、follow-up、cleanup 不要。これを選んで即 resume するなら pattern 2 が欲しかった。

### 2. `Agent.create(...)` + `agent.send(...)` - durable with follow-ups

```typescript
import { Agent } from "@cursor/sdk";

const agent = Agent.create({
  apiKey: process.env.CURSOR_API_KEY!,
  model: { id: "composer-2" },
  local: { cwd: process.cwd() },
});

try {
  const run = await agent.send("Find the bug in src/auth.ts");
  for await (const event of run.stream()) {
    if (event.type === "assistant") {
      for (const block of event.message.content) {
        if (block.type === "text") process.stdout.write(block.text);
      }
    }
  }
  const result = await run.wait();

  // Follow-up keeps full conversation context.
  const run2 = await agent.send("Now write a regression test for it");
  await run2.wait();
} finally {
  await agent[Symbol.asyncDispose]();
}
```

streaming、multi-turn conversation、lifecycle operation（cancel、status listener）が必要な場合。non-trivial integration の大半がこの shape。

### 3. `Agent.resume(...)` - pick up an existing agent later

```typescript
const agent = Agent.resume(previousAgentId, {
  apiKey: process.env.CURSOR_API_KEY!,
  model: { id: "composer-2" },
  local: { cwd: process.cwd() },
});
const run = await agent.send("Also update the changelog");
await run.wait();
```

process boundary をまたぐ: 昨夜の cleanup を続ける cron、user agent を extend する webhook、conversation state を reload する interactive CLI。**inline `mcpServers` は resume 跨ぎで persist されない** — resume call で再度 pass。

## Top Five Traps

ほぼすべての新規 integration が踏む trap。知っていれば prevent は容易。

### 1. Missing `cloud: { repos }` silently defaults to local

`AgentOptions` は `local` も `cloud` も require しない。両方 omit すると SDK は local runtime を選択。trap: cloud agent を意図して `cloud:` field を忘れると、error なしで local agent — local agent ID と local executor だけ。cloud が欲しいときは常に `cloud: { repos }` を明示。local でも default だが `local: { cwd }` を明示。

### 2. Two different kinds of failure, one instinct to conflate them

```typescript
import { Agent, CursorAgentError } from "@cursor/sdk";

const agent = Agent.create({ /* ... */ });

try {
  const run = await agent.send(prompt);
  const result = await run.wait();
  if (result.status === "error") {
    // Agent started but failed mid-run. Inspect transcript, git state, tool outputs.
    console.error("run failed: " + result.id);
    process.exit(2);
  }
} catch (err) {
  if (err instanceof CursorAgentError) {
    // Didn't start. Auth, config, network. Fix environment, retry.
    console.error("startup failed: " + err.message + ", retryable=" + err.isRetryable);
    process.exit(1);
  }
  throw err;
}
```

`CursorAgentError` thrown → run は実行されなかった（auth、config、network）。`result.status === "error"` → agent は work し、その work が failed。fix、exit code、observability が異なる。

### 3. Forgetting `await agent[Symbol.asyncDispose]()` leaks resources

SDK は local executor、persisted run store、cloud API client の handle を保持。dispose しないと child process leak、open database、long-running service では memory growth。常に `finally` で dispose、または `Agent.prompt()`（自動 dispose）、または tsconfig が対応なら `await using`:

```typescript
await using agent = Agent.create({ /* ... */ });
```

### 4. Streaming is optional but `wait()` is almost always required

`run.stream()` は observe、`run.wait()` は terminal result。streaming skip 可だが `wait()` skip すると finished/error/cancelled が分からず run internal watcher leak。常に `wait()`。live output 不要なら `wait()` のみ。

### 5. Not every `run` operation is supported on every runtime

`Run` は 4 operation — `stream`、`wait`、`cancel`、`conversation` — runtime が各々サポートするかは不定。呼ぶ前に常に `run.supports("...")` で guard:

```typescript
if (run.supports("cancel")) await run.cancel();
if (run.supports("conversation")) console.log(await run.conversation());
```

知っておく gap: detached/rehydrated run（live event store 閉後 `Agent.getRun(...)` で handle 取得）は `stream()` 非サポート、`conversation()` empty の場合あり。`run.unsupportedReason(op)` で reason。cloud `run.conversation()` は supported — stream から best-effort accumulate。

## Local vs Cloud, in one sentence each

- **Local** — caller machine 上で `cwd` に対し実行。caller environment と credential を再利用。dev loop と repo checkout 済み CI に good。
- **Cloud** — freshly cloned `repos[].url` に対し Cursor-hosted VM 上で実行。長時間 job、fire-and-forget automation、real PR 開封（`autoCreatePR: true`）に good。

## Auth, minimum viable

```bash
export CURSOR_API_KEY="cursor_..."  # user API key or team service-account key
```

`apiKey` 未指定時 SDK は `CURSOR_API_KEY` を読む。user key（[https://cursor.com/dashboard/cloud-agents](https://cursor.com/dashboard/cloud-agents)）も team service-account key（Team Settings -> Service accounts）も local/cloud 両方で動作。

401 なら usual suspects: key に surrounding whitespace、別 environment 向け mint、cloud run で repo access ない user の key。

## Model Selection

```typescript
import { Cursor } from "@cursor/sdk";

const models = await Cursor.models.list({ apiKey: process.env.CURSOR_API_KEY! });
```

`composer-2` は現在の default。`{ id: "auto" }` は server 選択。model ID は変わる。`Cursor.models.list()` で access 確認せず exotic ID を hardcode しない。

model は **local では required**、**cloud では optional**（server が caller account から default resolve）。

## MCP Servers

working tree 超の tool が必要な integration では inline で MCP server を pass。runtime transport を explicit に:

- Local agent は caller machine 上の stdio または HTTP MCP server 可。
- Cloud agent は network-reachable HTTP MCP または cloud-supported config が必要。cloud VM 内に local stdio process 不可。
- agent resume 後も MCP tool が必要なら `Agent.resume(...)` で再度 `mcpServers` を pass。

## Production Best Practices

unattended 実行の integration に適用:

1. **すべての `Agent.create` / `Agent.prompt` / `Agent.resume` を try/finally + `[Symbol.asyncDispose]()` で wrap**。non-negotiable。
2. **startup failure と run failure を区別** — `CursorAgentError` で exit 1、`result.status === "error"` で exit 2、`finished` のみ exit 0。
3. **streaming 前に `send()` 直後 `run.id` と `agent.agentId` を log**。stream hang 時、dashboard または `Agent.getRun(...)` 調査に ID が必要。
4. **`error.isRetryable` を respect** — backend が retry safe と示す specific failure。blind retry は duplicate cloud run。flag respect はしない。
5. **ambient config 不要なら `local: { settingSources: [] }`（default）**。`"all"` opt-in は caller environment から project/user/team/MDM settings を load — service からは rarely 望ましい。`settingSources` は `local` 下、top level ではない。cloud agent 無効（cloud は常に team/project/plugins honor）。
6. **CI の cloud agent では human page 不要なら `skipReviewerRequest: true`** — reviewer-request step 抑制、PR notification quiet。
7. **shared-infrastructure code では env var 頼りせず `apiKey` を explicit pass**。credential dependency 明確、cross-tenant mistake 防止。
8. **true one-shot では `Agent.prompt(...)` を prefer** — 自動 dispose、leak しにくい。

## Observing a Run You Didn't Launch

agent/run を ID で後から inspect 可:

```typescript
// Cloud: IDs that start with "bc-" auto-route to the cloud API.
const info = await Agent.get("bc-abc123", { apiKey });
const run = await Agent.getRun(runId, { runtime: "cloud", agentId: "bc-abc123", apiKey });

// Local: you need the cwd where the agent was created.
const localInfo = await Agent.list({ runtime: "local", cwd: process.cwd() });
```

cloud `bc-` prefix agent ID は **run ID ではない**。run ID のみ（log や webhook から）なら runtime hint 付き `Agent.getRun` に pass。混同しない。

## Canvas の提案

integration が agent を monitor、list、visualize する — active run dashboard、conversation replay、tool-call timeline — なら Cursor Canvas 提示。accept なら `canvas` skill に entirely defer。

## この Skill が Cover しないもの

- Cloud Agents REST API（`/v1/agents/*`）。non-TypeScript client 必要なら SDK parity 仮定前に REST API docs で current capabilities 確認。
- `.cursor/hooks.json` hooks。cloud agent は execute するが SDK は manage しない。Cursor Hooks docs 参照。
- Private workers / self-hosted cloud。Private Workers docs へ。
- Python / non-TypeScript SDK。執筆時点 first-party SDK なし。REST が portable option。
