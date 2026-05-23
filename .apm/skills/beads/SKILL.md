---
name: beads
description: bd または Beads を使うリポジトリで、永続的な project task tracking、issue dependency、blocker 管理、multi-session handoff、共有 work memory を扱うときに使います。ready work の確認、task の claim / close、follow-up 作成、blocker 調査、project context 復元、local plan と永続 tracking の使い分けを求められたときに発火します。
---

# Beads

Beads を共有 project task system として使います。local plan、scratch file、
personal memory は有用ですが、project work の永続的な source of truth ではありません。

## 最初の手順

次を実行します。

```bash
bd prime
```

出力が無い場合は、リポジトリに active な Beads workspace があるかを確認します。

```bash
bd where
```

## 優先ルート

shell access が利用できる場合は `bd` CLI を使います。これは最も compact で直接的な
Beads interface です。

## 基本 CLI ワークフロー

1. work を探します。

```bash
bd ready
bd list --status=open
bd list --status=in_progress
```

2. 編集前に確認します。

```bash
bd show <id>
```

3. work を atomic に claim します。

```bash
bd update <id> --claim
```

4. 実装中に新しい task が見つかった場合、永続的な follow-up work を作ります。

```bash
bd create "短いタイトル" --description="なぜ必要で、何をする必要があるか" --type=task --priority=2
```

5. 完了した work を close します。

```bash
bd close <id> --reason="Completed"
```

## Beads に置くもの

Beads は次に使います。

- 共有 project task。
- blocker と dependency。
- 発見した follow-up work。
- thread reset、compaction、handoff をまたいで残す必要がある work。
- 別の人または agent が resume できるべき status。

agent-local planning tool は、現在の turn の execution checklist にだけ使います。
共有 project state として扱ってはいけません。

## ルール

- Beads が利用できる場合、markdown TODO file を source of truth として作りません。
- `bd edit` は使いません。interactive editor を開くため、代わりに `bd update` の
  flag を使います。
- `bd` output を programmatic に parse する場合は `--json` を優先します。
- hook が installed の場合、`bd prime` はすでに injected されていることがあります。
  context が不足している場合は手動で実行します。
- work が実際に完了していない限り、task を自動 close または mutate しません。
