---
name: context-mode
description: shell コマンド実行、ファイル読み取り、検索、Web 取得、データ分析、コンテキスト管理を行うとき。コンテキストウィンドウの過剰消費を防ぐ context-mode MCP のルーティング規則。Codex CLI 向け。
---

# context-mode — 必須ルーティング規則

context-mode MCP ツールが利用できる環境では、コンテキストウィンドウの過剰消費を防ぐためこの規則に従います。ルーティングされていないコマンドを 1 回実行するだけで 56 KB がコンテキストへ流れ込むことがあります。Codex CLI の hook は `[features].hooks = true` のとき実行時に強制しますが、この skill はモデル側でも必須。厳守してください。

## 事前確認 — MCP の有無

`ctx_*` 系ツールは context-mode MCP が有効な場合だけ使えます。セッション開始直後に `ctx doctor`（存在確認）または `ctx_search` を 1 回試し、`unsupported call` や `command not found` が返った場合は MCP が未配備です。そのときは本規則の「sandbox へのリダイレクト」を `rg` / `head` / `wc` などの読み系コマンドと `apply_patch` / `exec_command` で代替し、それでも生データをコンテキストへ直投入しないよう、出力を `head -n 20` 程度に絞るかファイルへ書き出して参照してください。

## Think in Code — 必須

データの分析、集計、フィルタリング、比較、検索、解析、変換を行う場合は、`ctx_execute(language, code)` で **コードを書き**、`console.log()` には答えだけを出力してください。生データをコンテキストへ読み込んではいけません。手で計算するのではなく、分析をプログラムしてください。純粋な JavaScript を使い、Node.js 組み込み（`fs`、`path`、`child_process`）のみ利用します。`try/catch` を使い、`null` / `undefined` を扱ってください。1 本のスクリプトで 10 回のツール呼び出しを置き換えます。MCP がない環境では `exec_command` 上で同等の Node スクリプトを走らせ、stdout だけをコンテキストに入れてください。

## 禁止 — 使用しない

### curl / wget — 禁止
shell で `curl` / `wget` を使ってはいけません。生の HTTP レスポンスがコンテキストへ流れ込みます。
代わりに `ctx_fetch_and_index(url, source)`、または `ctx_execute(language: "javascript", code: "const r = await fetch(...)")` を使ってください。MCP がない環境でも、`exec_command` 上で `node -e` 経由のインライン HTTP（後述）は sandbox 迂回になるため避け、必ずスクリプトファイルを介して stdout だけを出してください。

### インライン HTTP — 禁止
`node -e "fetch(...)"` や `python -c "requests.get(...)"` は使わないでください。sandbox を迂回します。
代わりに `ctx_execute(language, code)` を使ってください。stdout だけがコンテキストへ入ります。MCP がない場合はスクリプトファイルを `exec_command` で実行し、標準出力だけを取り込む形にしてください。

### 直接の Web 取得 — 禁止
生の HTML は 100 KB を超えることがあります。
`ctx_fetch_and_index(url, source)` の後に `ctx_search(queries)` を使ってください。

## リダイレクト — sandbox を使う

### Shell（20 行を超える出力）
Shell をそのまま使ってよいのは、出力が短くて済む次のコマンド群のみです: `git`、`mkdir`、`rm`、`mv`、`cd`、`ls`、`rg`、`cat`、`head`、`tail`、`wc`、`npm install`、`pip install`、`bun`、`apm`。それ以外、または出力が 20 行を超えそうな場合は `ctx_batch_execute(commands, queries)`、または `ctx_execute(language: "shell", code: "...")` を使ってください。MCP がない場合は、`exec_command` で `| head -n 20` や `> /tmp/...` で出力を絞るかファイルへ逃がしてください。

### ファイル読み取り（分析目的）
**編集するため** に読む場合は通常の読み取りで問題ありません。**分析、探索、要約するため** に読む場合は `ctx_execute_file(path, language, code)` を使って、ファイル内容を sandbox 内で処理し、`console.log()` には結果だけを出してください。MCP がない環境でも、`exec_command` 上で `fs.readFileSync` を使った解析スクリプトを走らせ、答えだけを stdout に出す形を守ってください。

### grep / 検索（大量結果）
`rg` は許可コマンドですが、ヒット件数が多い場合は sandbox 内で `ctx_execute(language: "shell", code: "rg ... | head -n 20")` を使ってください。MCP がない場合は `exec_command` で `rg ... | head -n 20` のように必ず絞ってください。

## ツール選択

0. **MEMORY**: `ctx_search(sort: "timeline")` — 再開後はユーザーへ質問する前に過去コンテキストを確認します。
1. **GATHER**: `ctx_batch_execute(commands, queries)` — すべてのコマンドを実行し、自動でインデックス化して検索結果を返します。1 回の呼び出しで 30 回以上の操作を置き換えます。
2. **FOLLOW-UP**: `ctx_search(queries: ["q1", "q2", ...])` — すべての質問を配列にまとめ、1 回だけ呼び出します（既定は relevance モード）。
3. **PROCESSING**: `ctx_execute(language, code)` / `ctx_execute_file(path, language, code)` — sandbox 内で実行し、stdout だけがコンテキストへ入ります。
4. **WEB**: `ctx_fetch_and_index(url, source)` の後に `ctx_search(queries)` — 生 HTML はコンテキストへ入れません。
5. **INDEX**: `ctx_index(content, source)` — 後で検索できるよう FTS5 に保存します。

MCP が未配備のセッションでは、上記を `exec_command` + 絞り込み出力で代替します。ツール選択の優先順位（MEMORY → GATHER → FOLLOW-UP → PROCESSING → WEB → INDEX）は同じです。

## 並列 I/O バッチ

複数 URL の取得や複数 API 呼び出しでは、**必ず** `concurrency: N`（1-8）を含めてください。

- `ctx_batch_execute(commands: [3+ network commands], concurrency: 5)` — dig、docker inspect、複数リージョンのクラウドクエリ
- `ctx_fetch_and_index(requests: [{url, source}, ...], concurrency: 5)` — 複数 URL のバッチ取得

I/O 待ちが中心の作業（ネットワーク呼び出し、API クエリ）では **concurrency 4-8** を使ってください。CPU 負荷が中心の作業（npm test、build、lint）や状態を共有するコマンド（ポート、ロックファイル、同一リポジトリへの書き込み）では **concurrency 1** のままにしてください。

GitHub API のレート制限を避けるため、`gh` を含む `ctx_batch_execute` の `concurrency` は **最大 4** にしてください（gh の総呼び出し回数の上限ではなく、並列度の上限です）。

## 出力

成果物はファイルへ書き、インラインにしないでください。返す内容はファイルパスと 1 行の説明だけにします。
`ctx_search(source: "label")` で検索しやすいよう、source には説明的なラベルを付けてください。

## セッション継続性

skill、役割、決定事項はセッション全体で継続します。会話が長くなっても破棄しないでください。

## メモリ

セッション履歴は永続化され、検索できます。再開時はユーザーへ質問する前に検索してください。

| 必要な情報 | コマンド |
|------|---------|
| 何に取り組んでいたか | `ctx_search(queries: ["summary"], source: "compaction", sort: "timeline")` |
| 何を決めたか | `ctx_search(queries: ["decision"], source: "decision", sort: "timeline")` |
| 繰り返してはいけないこと | `ctx_search(queries: ["rejected"], source: "rejected-approach")` |
| どんな制約があるか | `ctx_search(queries: ["constraint"], source: "constraint")` |

注: ユーザープロンプトの履歴は利用できません。

「何をしていましたか？」と聞いてはいけません。先に検索してください。
検索結果が 0 件なら、新規セッションとして進めてください。

## ctx コマンド

`ctx stats` / `ctx doctor` / `ctx upgrade` / `ctx purge` は shell コマンドですが、前段の「Shell 許可リスト」の制限を受けません（context-mode MCP の管理用 CLI です）。

| コマンド | 動作 |
|---------|--------|
| `ctx stats` | `stats` MCP ツールを呼び出し、完全な出力をそのまま表示します |
| `ctx doctor` | `doctor` MCP ツールを呼び出し、返された shell コマンドを実行してチェックリストとして表示します |
| `ctx upgrade` | `upgrade` MCP ツールを呼び出し、返された shell コマンドを実行してチェックリストとして表示します |
| `ctx purge` | `confirm: true` で `purge` MCP ツールを呼び出します。知識ベース削除前に警告してください。 |

/clear または /compact の後も、知識ベースとセッション統計は保持されます。最初からやり直すには `ctx purge` を使ってください。

## Windows / sandbox 共通の注意点

以下は context-mode 専有ではなく、sandbox 全般の注意点です。他の instruction からも参照されます。

**PowerShell cmdlet** — Sandbox は bash を使います。PowerShell cmdlet（`Format-List`、`Get-Culture` など）は `command not found` で失敗します。`pwsh -NoProfile -Command "..."` でラップしてください。

**相対パス** — Sandbox の CWD は一時ディレクトリであり、プロジェクトルートではありません。絶対パスへ変換してください。不明な場合はユーザーに確認してください。

**Windows ドライブ文字** — Sandbox は Git Bash / MSYS2 で動作します。`X:\path` は `/x/path`（小文字、`/mnt/` なし）に変換します。`/mnt/<letter>/` は絶対に出力しないでください。

**パスのクォート** — パス中の空白は分割の原因になります。常にダブルクォートしてください: `rg "symbol" "$REPO_ROOT/some dir/Source"`。
