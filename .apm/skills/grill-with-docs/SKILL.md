---
name: grill-with-docs
description: 計画をTABBINのドメインモデルと照合し、用語を磨き、決定が固まったらドキュメント（CONTEXT.md、ADR）を逐次更新する「グリリング」セッション。プロジェクトの言語と記録された決定に対して計画をストレステストしたいときに使います。
---

<what-to-do>

この計画のあらゆる側面について徹底的にインタビューし、共有の理解に到達するまで問い続ける。設計ツリーの各分岐を順にたどり、決定間の依存関係を1つずつ解消していく。各質問に対して推奨回答を提示する。

質問は1度に1つずつ行い、各質問へのフィードバックをもらってから次の質問に進む。

コードベースを探索すれば答えられる質問は、コードベースを探索して答える。

</what-to-do>

<supporting-info>

## ドメイン認識

TABBINのドメインモデルは `src/types/` に定義されている。探索時はまず以下を確認する:

- `src/types/storage.ts` — `TabGroup`、`ParentCategory`、`UserSettings`、`CustomProject` など主要型
- `src/types/saved-tabs.ts` — UIコンポーネント向けのProps型（`CategoryGroupProps`、`SortableDomainCardProps` など）
- `src/types/background.ts` — background script との通信型
- `src/types/ai-chat-protocol.ts` — AIチャットのメッセージプロトコル

主要ドメイン概念:
- **TabGroup**: ドメイン単位の保存タブグループ。`domain`、`urlIds`、`parentCategoryId` を持つ
- **ParentCategory**: TabGroupを分類するトップレベルカテゴリ
- **SubCategory**: URL単位の子カテゴリ。キーワードベースで自動分類可能
- **CustomProject**: ユーザー定義のプロジェクト単位URL管理

### ファイル構造

TABBINはブラウザ拡張のため単一コンテキストが基本:

```
/
├── CONTEXT.md            ← 用語集（初回の用語確定時に遅延作成）
├── docs/
│   └── adr/              ← 技術決定記録（初回のADR必要時に遅延作成）
├── src/
│   ├── types/            ← ドメイン型定義（source of truth）
│   ├── features/         ← 機能モジュール（saved-tabs, options, ai-chat 等）
│   ├── components/       ← 再利用可能UI
│   ├── lib/              ← background helper, storage, browser wrapper
│   ├── constants/        ← 定数定義
│   ├── utils/            ← ユーティリティ
│   └── entrypoints/      ← WXT エントリポイント
```

`CONTEXT-MAP.md` が必要になるのは、features 間で明確なドメイン分離ができた場合のみ。現時点では `src/types/storage.ts` が全featuresの共有source of truth。

ファイルは遅延作成する — 書くものがあるときだけ作る。`CONTEXT.md` が存在しない場合、最初の用語が確定したときに作る。`docs/adr/` が存在しない場合、最初のADRが必要になったときに作る。

## セッション中の運用

### 用語集との照合

ユーザーが `CONTEXT.md` の既存言語と矛盾する用語を使った場合は、即座に指摘する。例えば:
- 「ドメインカード」と言ったが用語集では「TabGroup」と定義されている場合: 「用語集ではTabGroupと定義されていますが、ドメインカードとおっしゃっているのはUIコンポーネントのことですか、データモデルのことですか？」
- 「カテゴリ」と曖昧に言った場合: 「ParentCategory（トップレベル）とSubCategory（URL単位）のどちらを指していますか？」

### 曖昧な言語の精緻化

TABBINで特に曖昧になりやすい用語:
- **カテゴリ** — ParentCategory / SubCategory / CustomProject.categories の3種が存在
- **保存** — タブをTabGroupとしてストレージに保存する操作と、URLをクリックしてブラウザで開く操作の混同
- **削除** — URL個別削除 / TabGroup削除 / ParentCategory削除 / 自動削除（autoDeletePeriod）の区別
- **開く** — 既存タブで遷移 / バックグラウンドで開く / 別ウィンドウで開くの区別

### 具体的シナリオの議論

ドメインの関係性について議論するときは、具体的なシナリオでストレステストする:
- 「ParentCategoryを削除したとき、所属するTabGroupはどうなりますか？」
- 「TabGroupのURLをCustomProjectに移動するケースはありますか？」
- 「SubCategoryのキーワードが複数の子カテゴリにマッチした場合の優先順位は？」

### コードとのクロリファレンス

ユーザーが何かの動作について述べたときは、コードがそれを裏付けているか確認する:
- `src/types/storage.ts` の型定義と実際の挙動の一致
- `src/lib/` のストレージ helper と型定義の整合性
- `wxt.config.ts` の manifest 権限と実際のAPI利用の一致

矛盾を見つけたら指摘する: 「型定義では`urlIds`が新形式ですが、このコードではまだ旧形式の`urls`を使っています — マイグレーション済みですか？」

### CONTEXT.md の逐次更新

用語が確定したら、その場で `CONTEXT.md` を更新する。まとめずに行う。フォーマットは [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md) を参照。

`CONTEXT.md` は実装詳細を完全に排除する。`CONTEXT.md` を仕様書、スクラッチパッド、実装決定の保管場所として使わない。これは用語集であり、それ以上でもそれ以下でもない。

### ADRの提案は慎重に

以下の3つがすべて満たされたときだけADRの作成を提案する:

1. **後戻りが困難** — ストレージスキーマ変更、manifest権限追加など、後からの変更コストが高い決定
2. **文脈なしでは驚き** — 例えば「なぜ`urls`と`urlIds`の両方を持っているの？」という疑問が自然に生じる決定
3. **本当のトレードオフの結果** — 例えばローカルLLM（Ollama）vs クラウドAPIの選択など、代替案が明確に存在した決定

3つのうち1つでも欠けていればADRはスキップする。フォーマットは [ADR-FORMAT.md](./ADR-FORMAT.md) を参照。

</supporting-info>
