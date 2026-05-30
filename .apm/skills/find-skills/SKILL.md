---
name: find-skills
description: 「X のやり方は？」「X 用の skill を探して」「X できる skill はある？」など、install 可能な agent skill を探したいとき、または agent 能力の拡張に興味を示したときに使います。
---

# skill の検索

open agent skills エコシステムから skill を発見・インストールする手順です。

## 使用タイミング

次のようなユーザー依頼で使います:

- 既存 skill がありそうな一般的タスクについて「X のやり方は？」と聞かれた
- 「X 用の skill を探して」「X の skill はある？」と言われた
- 専門的な能力 X について「X できる？」と聞かれた
- agent 能力の拡張に興味を示した
- tool、template、workflow を探したい
- 特定 domain（design、testing、deployment など）の支援を欲しがっている

## Skills CLI とは

Skills CLI（`npx skills`）は open agent skills エコシステムの package manager です。skill は specialized な知識、workflow、tool で agent 能力を拡張するモジュールパッケージです。

**主要コマンド:**

- `npx skills find [query]` - skill を対話的または keyword で検索
- `npx skills add <package>` - GitHub などから skill をインストール
- `npx skills check` - skill の更新を確認
- `npx skills update` - インストール済み skill をすべて更新

**skill 一覧:** https://skills.sh/

## ユーザーが skill を見つける手順

### Step 1: 必要なものを把握

ユーザーが何を求めているかを特定します:

1. domain（例: React、testing、design、deployment）
2. 具体的な task（例: test 作成、animation 作成、PR review）
3. skill が存在しそうな一般的タスクかどうか

### Step 2: skill を検索

関連 query で find コマンドを実行します:

```bash
npx skills find [query]
```

例:

- 「React アプリを速くするには？」→ `npx skills find react performance`
- 「PR review を手伝って」→ `npx skills find pr review`
- 「changelog を作りたい」→ `npx skills find changelog`

コマンドは次のような結果を返します:

```
Install with npx skills add <owner/repo@skill>

vercel-labs/agent-skills@vercel-react-best-practices
└ https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices
```

### Step 3: 選択肢を提示

関連 skill が見つかったら、次をユーザーに提示します:

1. skill 名と役割
2. 実行できる install コマンド
3. skills.sh の詳細リンク

応答例:

```
I found a skill that might help! The "vercel-react-best-practices" skill provides
React and Next.js performance optimization guidelines from Vercel Engineering.

To install it:
npx skills add vercel-labs/agent-skills@vercel-react-best-practices

Learn more: https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices
```

### Step 4: インストールを提案

ユーザーが進めたい場合、skill をインストールできます:

```bash
npx skills add <owner/repo@skill> -g -y
```

`-g` は global（user-level）インストール、`-y` は確認プロンプトをスキップします。

## よくある skill カテゴリ

検索時は次のカテゴリを参考にします:

| Category        | Example Queries                          |
| --------------- | ---------------------------------------- |
| Web Development | react, nextjs, typescript, css, tailwind |
| Testing         | testing, jest, playwright, e2e           |
| DevOps          | deploy, docker, kubernetes, ci-cd        |
| Documentation   | docs, readme, changelog, api-docs        |
| Code Quality    | review, lint, refactor, best-practices   |
| Design          | ui, ux, design-system, accessibility     |
| Productivity    | workflow, automation, git                |

## 効果的な検索のコツ

1. **具体的な keyword を使う**: 「testing」だけより「react testing」の方が良い
2. **別の用語も試す**: 「deploy」で見つからなければ「deployment」や「ci-cd」を試す
3. **人気 source を確認**: 多くの skill は `vercel-labs/agent-skills` や `ComposioHQ/awesome-claude-skills` から来る

## skill が見つからない場合

関連 skill がない場合:

1. 既存 skill が見つからなかったことを伝える
2. 一般能力で task を直接手伝えることを提案する
3. `npx skills init` で独自 skill を作れることを提案する

例:

```
I searched for skills related to "xyz" but didn't find any matches.
I can still help you with this task directly! Would you like me to proceed?

If this is something you do often, you could create your own skill:
npx skills init my-xyz-skill
```
