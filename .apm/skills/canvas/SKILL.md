---
name: canvas
description: Cursor Canvas はチャット横で開ける live React app です。定量分析、billing 調査、security audit、architecture review、データ量の多い内容、timeline、chart、table、interactive 探索、再利用可能 tool、visual layout が有効な standalone analytical artifact を agent が生成するときは **必ず** canvas を使います。MCP tool（Datadog、Databricks、Linear、Sentry、Slack など）の結果で data が deliverable の場合は特に canvas を優先し、markdown table や code block への dump は避けます。markdown table を書きそうになったら止めて canvas を使います。`.canvas.tsx` file の create、edit、debug 時も **必ず** この skill を読みます。
metadata:
  surfaces:
    - ide
---
canvas は IDE が compile し、ユーザーがチャット横で開ける単一 `.canvas.tsx` file です。以下 workflow を順に従います。

## ワークフロー

### 1. canvas を使うか判断

trigger は **response shape ではなく user intent** です。ユーザーがこの output をチャットから **分離した standalone artifact** として見ると benefit があるかを問います。output が手段（draft message、code fix、別 tool の dashboard）なら canvas は skip します。

**agent が新しい standalone analytical output を生成するとき canvas を使う:**
- 定量分析と metrics breakdown（例: 「500 リクエスト送って失敗数を教えて」）
- database query から structured finding を出す billing または account 調査
- カテゴリ分けされた finding 付き security audit または architecture review
- cross-system data analysis と overlap report
- data が deliverable である MCP tool（Databricks、Datadog など）からの structured data
- financial analysis、margin decomposition、usage trend report
- ユーザーが見たいと依頼した、数行を超える table

**canvas を使わない場合:**
- ユーザーが **特定 tool** での作業を依頼 — 「Datadog dashboard を作って」は canvas ではなく Datadog dashboard
- ユーザーに **特定 deliverable** がある — 「support 返信を draft」「code を fix」「PR を作って」
- ユーザーが **既存 artifact 内で作業** — HTML dashboard 改善、既存 file 編集
- **targeted debugging** または active development（途中で structured finding が出ても）
- 短い factual answer、単発 file edit、quick clarifying question
- MCP tool が **別 deliverable の中間 step**（例: support reply draft のため Stripe を query）

### 2. canvas を書く

**Location.** canvas は `/Users/<user>/.cursor/projects/<workspace>/canvases/<name>.canvas.tsx` に置きます。IDE が detect するのは **その exact directory 内** に直接書かれた file のみ — subfolder、別 extension、その他 location は拾いません。新規 canvas は write file tool で **その path** に `.canvas.tsx` を作成します。path を伝えるか chat に code を示すだけで止めません。managed `canvases/` directory は Cursor が pre-provision したものとして扱い、`mkdir` や存在確認に turn を使わず直接 file を書きます。他目的（既存 canvas 確認など）での list は可。environment の absolute path（terminal、transcript、recently-viewed files）から workspace directory が分からない場合は `~/.cursor/projects/` を list し、推測しません。descriptive な kebab-case filename（`.canvas.tsx` 終わり）を使い、acronym は capitalization を保ち残りは lowercase。

**File rules:**
- canvas 1 つにつき `.canvas.tsx` file は 1 つ。helper file、style file、supporting module は作らない。
- import は **`cursor/canvas` のみ**。relative import、npm package、Node built-in は不可。
- top-level component を default-export。
- すべて data を inline embed。**`fetch()` 不可、network call 不可。**

**Component discovery:** hand-rolled markup より built-in `cursor/canvas` component を優先。public surface（component、hook、prop type、token）は `~/.cursor/skills-cursor/canvas/sdk/index.d.ts` と sibling `.d.ts` に宣言 — exact export、prop shape、hook signature が必要なら読み、推測しない。存在しない export 参照が最も common な runtime error。

以下 Canvas generation policy を書きながら適用し、返却前に pre-delivery self-check（section 6）を完了します。

## Design guidance

創造的に。SDK は expressive building block を提供 — content に最適な組み合わせを使う。ただし slop は避ける: gradient、emoji、box-shadow、rainbow coloring なし。Cursor canvas は flat、minimal、purposeful。

### Visual hierarchy

すべてを同等に扱わない。primary content はより多く space、大きい heading、accent color。supporting content は compact。squint test: 目を細めて — 何が重要か分かるか？

**Color.** すべて `useHostTheme()` token から — SDK declaration の JSDoc で return shape と usage pattern を読む。hardcoded hex 不可。accent color は意図的に、すべてに使わない。

### Slop patterns — 禁止

これらは low-quality output を生む。2 つ以上ある場合は redesign。

- **Gradients** — `linear-gradient`、`radial-gradient`、`background-clip: text` 不可。
- **Emojis** — icon、status indicator、bullet、section marker として emoji 不可。
- **Box shadows** — `box-shadow` 不可。flat surface のみ。
- **Wall of identical cards** — すべての section が同じ card style で variation なし。open section と card を混ぜる。
- **Rainbow coloring** — 各 element に別 color。大半は neutral、color は sparingly で purpose あり。
- **Giant text** — H1（24px）超の font size、または CardHeader に bold text を詰め込む。
- **Decorative borders** — すべての element に colored border。border は structural（subtle stroke token）、decorative ではない。

### Pre-delivery self-check

canvas code を返す前に verify:
1. layout に visual hierarchy があるか。1 つが stand out するか。
2. composition に variety があるか。uniform block の単一 column だけではないか。
3. slop check: 上記 forbidden pattern を scan。

## canvas の紹介

canvas を作成したら、chat response に短い note を添え、チャット横で開ける canvas を作ったことを伝えます:

- **First canvas** — workspace `canvases/` に他 `.canvas.tsx` がなければ、canvas とは何か 1 文。
- **Unsolicited canvas** — ユーザーが canvas を求めていなければ、plain text より canvas を選んだ理由を 1 文。

両方当てはまることもあり。合計 1〜2 文で十分。以降の canvas では intro を skip。

## Troubleshooting

canvas が blank または missing の場合、最も common な原因は `/Users/<user>/.cursor/projects/<workspace>/canvases/` **exact** 配下に書かれていないこと — その path へ re-save。managed directory を手動 create しようと debug しない。file path の修正に集中。ユーザーは response の canvas file path をクリックして開ける（他 file path と同様）。canvas server が build 後 `<name>.canvas.status.json` sidecar を書く場合、`status`、`diagnostics`、`error` field を読める。best-effort で存在しないこともあるため block しない。

## Good example

```tsx
import { Divider, Grid, H1, H2, Stack, Stat, Table, Text } from 'cursor/canvas';

export default function ServiceOverview() {
  return (
    <Stack gap={20}>
      <H1>Service Overview</H1>
      <Grid columns={3} gap={16}>
        <Stat value="6" label="Total Services" />
        <Stat value="5" label="Healthy" tone="success" />
        <Stat value="1" label="Degraded" tone="warning" />
      </Grid>
      <Divider />
      <H2>Service Status</H2>
      <Table
        headers={["Service", "Status", "Uptime", "Latency"]}
        rows={[
          ["api-gateway", "Operational", "99.99%", "12ms"],
          ["auth-service", "Degraded", "99.2%", "340ms"],
          ["billing", "Operational", "99.8%", "45ms"],
        ]}
        rowTone={[undefined, "warning", undefined]}
      />
      <Divider />
      <H2>Recent Changes</H2>
      <Text>Auth service latency increased after the 14:30 deploy.</Text>
      <Text tone="secondary" size="small">Last checked: Apr 7, 2026 14:52 UTC</Text>
    </Stack>
  );
}
```

Grid 内 Stat、H2 直下 Table、card なし text section。

## Bad example — 真似しない

```tsx
// BAD — every section wrapped in Card, no hierarchy, Table unnecessarily boxed
<Stack gap={12}>
  <Card><CardHeader>Summary</CardHeader><CardBody><Text>6 services.</Text></CardBody></Card>
  <Card><CardHeader>Status</CardHeader><CardBody><Table headers={[...]} rows={[...]} /></CardBody></Card>
  <Card><CardHeader>Changes</CardHeader><CardBody><Text>Latency increased.</Text></CardBody></Card>
</Stack>
```
