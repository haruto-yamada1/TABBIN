# Codex のコンテキスト最適化

対象は個人端末の Codex CLI と TABBIN の開発作業です。拡張機能の
`package.json`、ロックファイル、ブラウザ権限にはツールを追加しません。
Headroom 未導入の共同開発者や CI は通常の開発コマンドを使えます。

benchmark の `codex` は利用者がインストールした host CLI です。Knip の
`ignoreBinaries` にこの外部 binary だけを宣言し、拡張の依存関係として追加しません。
依存関係・unlisted・他の binary の検査は維持します。

## 選択と採用条件

| 作業                                                     | 選択                                          | 原文が必要な場合                           |
| -------------------------------------------------------- | --------------------------------------------- | ------------------------------------------ |
| 通常の設計・実装・小規模検索・MCP 応答                   | 検証済み端末では Codex → Headroom、cache mode | native Read / shell / diff                 |
| 短い git status、ファイル操作、正確な source / diff      | native tools                                  | そのまま取得                               |
| 長い Vitest / build / lint / typecheck / Playwright 出力 | 明示的 RTK → Headroom                         | `rtk proxy`、対応版の recall、保存したログ |
| 大量 JSON / ログの厳密集計、FTS5 検索、必要な履歴復旧    | context-mode MCP を明示利用                   | 件数と ID を ground truth と照合           |
| シンボル検索                                             | 既存 Serena                                   | Headroom の自動 Serena 登録は使わない      |
| プロキシ・認証・復元の障害                               | 通常の Codex 直結                             | 元設定と既存セッションで再開               |

Headroom は送信直前の HTTP プロキシ、RTK はコマンド出力フィルタ、
context-mode は MCP の外部処理・索引です。削減率を足し算しません。
Headroom はセッション開始時に起動し、Skill の呼び出しごとには起動しません。
初期候補は cache + lossless。token mode、共有メモリ、ML 圧縮は別の比較実験です。

採用には実通信の増分、正しい結果、同じ認証・モデル・effort、tool / MCP、
履歴・compaction・直結復旧、比較上の利益が必要です。正常な応答や doctor の
表示だけで採用せず、利益が確認できない端末は直結を維持します。

## 検証した版と事前棚卸し

2026-10-10〜11 の実機検証:

| 項目                | 検証値                                                             |
| ------------------- | ------------------------------------------------------------------ |
| Headroom            | 0.40.0、公式 tag commit `855390d6110e0bbb199d9b97025baac16c2f5cf3` |
| Codex CLI           | 0.160.1                                                            |
| Python / uv         | 3.13.3 / 0.10.4                                                    |
| RTK                 | 0.34.3                                                             |
| context-mode        | 1.0.161                                                            |
| 作業モデル / effort | `gpt-6.1-sol` / `xhigh`                                            |
| 認証                | ChatGPT、API キーへの切替なし                                      |
| TABBIN 起点         | `850440afe3d0d3977fabc353061f6622f636273b`                         |

Headroom の最新安定版は確認時点で 0.40.0。RTK/context-mode は既存版を検証し、
同時更新しません。別版や別 Codex binary を使う場合は以下を再検証します。

```sh
type -a codex uv rtk context-mode headroom
codex --version
codex login status
rtk --version
rtk init --help
rtk init --show
rtk gain
```

`rtk init --show` は版により Claude 設定を表示します。Codex hook の存在を
この表示から推測せず、有効な `CODEX_HOME` の `config.toml` / `hooks.json`、
プロジェクト・plugin hooks、MCP 登録と実行時挙動を照合します。
context-mode の doctor / stats は実際に接続した MCP から確認します。

認証は種別だけ記録します。token、`auth.json`、環境変数値、account ID、
秘匿ヘッダー、実会話を公開ログへ出しません。既存 `codex resume --all` の
可視性を確認し、合成テスト用セッションの ID だけを個人記録へ保存します。

変更前の個人バックアップ例:

```sh
codex_config_root="${CODEX_HOME:-$HOME/.codex}"
codex_backup_root="$codex_config_root/backups/context-optimization-before"
umask 077
mkdir -p "$codex_backup_root"
chmod 700 "$codex_backup_root"
for codex_config_file in config.toml hooks.json; do
  if [ -f "$codex_config_root/$codex_config_file" ]; then
    cp "$codex_config_root/$codex_config_file" "$codex_backup_root/$codex_config_file"
    chmod 600 "$codex_backup_root/$codex_config_file"
  fi
done
```

存在する指示ファイルも同様に退避します。`auth.json` を repo やこの公開記録へ
コピーしません。バックアップ先と復元手順は個人用記録に残します。

## 隔離導入と起動

公式 PyPI CLI を uv の隔離環境へ入れます。npm の同名パッケージは TS SDK です。
`[all]` や torch を無条件に導入しません。

```sh
uv tool install --python 3.13 'headroom-ai[proxy,mcp,code]==0.40.0'
"$HOME/.local/bin/headroom" --version
"$HOME/.local/bin/headroom" wrap codex --help
"$HOME/.local/bin/headroom" proxy --help
```

既存サービスと競合しない専用ポートを選びます。以下は検査用 18787 の例です。
新規プロキシに対して設定を適用し、既に起動している別設定のプロキシを
再利用して検証済みと判定しません。

```sh
umask 077
export HEADROOM_HOST=127.0.0.1
export HEADROOM_WORKSPACE_DIR="$HOME/.local/state/tabbin-headroom"
export HEADROOM_CONFIG_DIR="$HEADROOM_WORKSPACE_DIR/config"
export HEADROOM_BEACON=off
export HEADROOM_TELEMETRY=off
export HEADROOM_UPDATE_CHECK=off
export HEADROOM_NO_SUBSCRIPTION_TRACKING=1
export LITELLM_LOCAL_MODEL_COST_MAP=True
export HEADROOM_DISABLE_KOMPRESS=1
export HEADROOM_LOSSLESS=1
export HEADROOM_CODEX_WIRE_DEBUG=0
export HEADROOM_LOG_MESSAGES=0
unset HEADROOM_PROBE_RECORD_DIR
mkdir -p "$HEADROOM_WORKSPACE_DIR" "$HEADROOM_CONFIG_DIR"
chmod 700 "$HEADROOM_WORKSPACE_DIR" "$HEADROOM_CONFIG_DIR"
"$HOME/.local/bin/headroom" wrap codex --port 18787 --code-memory none --no-mcp
```

CLI の標準起動を別名にする場合は、上の環境設定を個人の
`~/.local/bin/codex-headroom` に保存します。先頭を `#!/bin/sh` / `set -eu` とし、
最後の行を `exec "$HOME/.local/bin/headroom" wrap codex --port 18787
--code-memory none --no-mcp -- "$@"` の 1 行に変更します。`chmod 700` 後に
`~/.local/bin/codex-headroom` で起動します。`codex` を alias で置き換えず、
通常の直結復旧コマンドを保ちます。`uv tool dir --bin` が異なる場合は実際の
tool path を使います。非対話 shell と端末の PATH は異なる場合があるため、
PATH への追加が必要なら shell 設定をバックアップして `uv tool update-shell` を使います。

v0.40.0 は Beacon が既定 ON で、未知の値でも ON です。`off` を正確に指定します。
local telemetry と Beacon は別設定です。初回は lossless を明示し、追加 ML モデルの
ダウンロードと Headroom MCP 自動登録を止めます。`--no-mcp` だけで通常の lossy
圧縮を使うと、CCR 原文回収ができません。CCR を使う実験では別途 retrieval MCP を
登録して回収まで実証し、既存 MCP と重複登録しないでください。

`--code-memory none` だけでは Headroom MCP 登録を止めません。また、Headroom
所有の古い Serena/tokensave 登録を外す場合があります。user-managed の Serena を
使い、初回前後の config を照合します。通常 wrap は durable `CODEX_HOME` と provider
ID を保ち、経路設定をプロセス内で上書きします。恒久 provider の追加が必要なら
別途バックアップして `init` の差分を確認します。

## 実通信を確認する

新しい専用プロキシで、合成 prompt の前後に数値を採取します。

```sh
bun tools/scripts/verify-codex-context-path.ts http://127.0.0.1:18787
```

返るのは request 数、failure 数、モデルと検査状態だけです。前の値が
`requests=0, failed=0` なら、短い応答を求めた後に以下を実行します。

```sh
bun tools/scripts/verify-codex-context-path.ts http://127.0.0.1:18787 0 0 gpt-6.1-sol
```

検査は counter 増分なし、reset、failure 増加、モデル違い、cache 以外、
不正なデータを拒否します。専用 loopback URL だけを許可し、redirect も拒否します。
並行利用や補助的なタイトル生成・compaction は別モデルを使う場合があるため、
対象の短い inference を専用プロセスで比較してください。proxy のカウンターと
provider-reported token を区別し、認証種別は Codex 側でも確認します。

### Codex 0.160.1 の exec 引数位置

実機で以下は exit 0・正しい応答でも、Headroom の API request 数が 0 でした。

```sh
headroom wrap codex --code-memory none --no-mcp --port 18787 -- \
  exec -c 'model_reasoning_effort="xhigh"' --model gpt-6.1-sol \
  --ephemeral --skip-git-repo-check --sandbox read-only --json \
  'Reply with exactly HEADROOM_SMOKE_OK. Do not use tools.'
```

Headroom が `exec` 前に置く `-c openai_base_url=...` と、後の `-c` を混在させると
前の経路設定が失われました。全ての `-c` を `exec` 前に揃えると、同じモデルの
実通信を計測できました。公式 CLI ソースは root overrides を exec に継承する
設計ですが、前後に分けた global 引数の収集差は実機の再現結果として扱います。

```sh
headroom wrap codex --code-memory none --no-mcp --port 18787 -- \
  -c 'model_reasoning_effort="xhigh"' \
  exec --model gpt-6.1-sol --ephemeral --skip-git-repo-check \
  --sandbox read-only --json \
  'Reply with exactly HEADROOM_SMOKE_OK. Do not use tools.'
```

モデル/effort は利用者の現在値を使います。上の固定値は検証例です。
`--ignore-user-config` はこの版では exec 専用です。対話起動へ渡せません。
対話 UI は対応した端末で起動し、agent shell の非 TTY エラーを認証障害と
混同しません。HTTP/WS と OAuth/Account-ID の通過は実通信で確認します。

LiteLLM は別途 remote cost map の取得経路を持つため、local map を明示します。
この検証では Headroom license key は未設定です。context-mode 1.0.161 は起動時と
定期的に npm の版確認を行います。MCP を残す場合の既存通信として区別し、
追加通信を止めた比較環境の制約を通常端末の検証と混同しません。

## 個人 hook と MCP の移行

repo の APM 同期は個人の `~/.codex`、plugin、Claude 設定を変更しません。
まずバックアップと差分を用意し、Codex 用だけを変更します。

- global `AGENTS.md` / `RTK.md` の全 shell 必須ラップを限定 RTK の指示へ変更。
- context-mode MCP 登録を残し、強制 routing の PreToolUse と長文 routing を
  常時注入する SessionStart だけを opt-in 構成から外す。
- PostToolUse / PreCompact / UserPromptSubmit の記録は役割を確認して維持。
  安全用 hook、Harness、ORCA 等の他者 hook は外さない。
- RTK の自動全書換えは追加せず、必要なコマンドだけ明示的に使う。
- Serena / Context7 / Playwright の登録と起動を前後で照合。

PreToolUse は routing だけでなく追加の Bash deny/ask と MCP Read deny も扱います。
除去前に installed security module が読む project-local/shared settings と Codex の
global settings の有効な policy を確認します。この端末の TABBIN は Bash allow 2 /
deny 0 / ask 0、Read/Grep deny 0、managed worktree と合成 workspace は全て 0 でした。
global Codex settings の追加 policy ファイルも無く、除去で失われた有効な deny/ask は
ありません。native の sandbox/approval と MCP server 内の deny 判定は維持します。
別端末・別 project に有効な追加 policy がある場合は、security 判定を維持する構成を
先に検証し、routing と一緒にその保護を削除しません。

hook の実行順や `updatedInput` の対応を版名から推測しません。現在の Codex
公式資料と installed source を確認し、小さな dummy 操作で検証します。
context-mode 経由の shell が RTK 自動 hook を通ることも仮定しません。
Claude など他クライアントの既存 RTK hook は今回の Codex 移行対象外です。

context-mode の launcher が他クライアントの hook 修復も行う版では、Codex の
MCP 登録だけを installed package の `build/server.js` と実際の Node binary の
直接起動へ変更できます。パスはその端末で解決し、更新後は再確認します。
他の MCP、tool permission entry、hook の記録を削除しません。

```sh
rtk test bun run test
rtk err bun run lint
rtk err bun run compile
rtk playwright test
```

RTK 0.34.3 の合成失敗 fixture は raw / `rtk test` / `rtk err` とも exit 7 を維持。
`rtk test` は原因と expected 値を保持しましたが、`rtk err` は expected 値を
省略しました。詳細は同じ引数の raw / `rtk proxy` で再取得します。recall は
対応版で実際に ID が返る場合だけ使い、同版で常に使えると仮定しません。
機械処理する JSON は native / `rtk proxy` で受け取ります。

専用の `rtk playwright test --config ./playwright.config.mjs` でも合成ブラウザの
意図的失敗を確認しました。exit 1、expected `Fixture missing` / received
`Fixture ready`、locator と source 行を保持し、full output の tee log を取得できました。
期待値を変えて失敗を隠さず、private screenshot / error-context も原文として保持します。

### この端末に適用した範囲

2026-10-11、比較合格後に uv の host tool として 0.40.0 を恒久導入し、
前述の個人 launcher を作成しました。個人の全 shell 必須 RTK 指示を限定運用に
置き換え、context-mode の強制 PreToolUse / SessionStart の 2 entry だけを除去。
MCP は Node 24 の MCP-only server へ変更しました。バックアップとの機械的比較で、
その他の config、ORCA を含む他 hook、global AGENTS、provider/model/effort、MCP 名、
tool permission entry が一致することを確認しました。認証ファイルは退避・変更して
いません。config/hook/指示は 0600、backup と launcher は所有者限定です。

新 launcher の native shell は `HOST_NATIVE_OK` を返し、proxy は 0→4 / failure 0 /
同じ作業モデルで検査合格。その後 context-mode の execute・index・search が
合成整数/ID で全て完了し、proxy は 4→9 / failure 0 でした。最初の MCP_DOCKER
handshake 失敗は既存 Docker daemon の停止を確認し、インストール済み Docker を
起動した後の同じ設定で解消しました。他の MCP 設定を変更していません。

個人用実行記録には適用前 backup、合成 smoke の events / stderr、launcher、
停止した専用 PID の照合を保存しました。これらのパス・生出力・既存会話は repo に
含めません。repo に保存するのは APM 原本・生成物、検証コード、匿名の集計と
この手順だけです。デスクトップアプリ全体の通信をこの CLI launcher が変更するとは
扱いません。

Headroom 0.40.0 のライセンスは Apache-2.0。今回の設定は元の ChatGPT 認証を
保ち、API キー、追加ライセンスキー、従量課金 provider を導入していません。
別の認証・利用条件を使う端末は自分の契約と現行条件を確認します。

## 計測と実機結果

repo の Node 24 / Bun 1.3.14 と host の Codex / Headroom / RTK / context-mode を
確認してから実行します。runner の測定モデル/effort は検証した
`gpt-6.1-sol` / `xhigh` に固定されています。自分の現在値が異なる場合は、
既存モデルを切り替えず、runner の測定条件を揃えて検証してから使います。

`--run` は親環境に非空の `CODEX_API_KEY` / `OPENAI_API_KEY` がある場合、
Codex / Headroom を起動する前に拒否します。保存済みログインへ黙って切り替えたり、
意図せず API キー認証で計測したりしません。空の key 変数も子環境から除き、
既存の認証 home は維持します。認証種別は事前棚卸しで確認してください。

```sh
# --run なしでは公開 snapshot・匿名 fixture・ground truth の準備だけ
bun tools/scripts/benchmark-codex-context.ts --output /tmp/codex-context-prepared
# 新しい私有出力先で A/B/C/D 各2回を実測
bun tools/scripts/benchmark-codex-context.ts --run --repetitions 2 \
  --headroom headroom --output /tmp/codex-context-measured
```

既存出力先は上書きせず拒否します。出力先は自分が所有する新規 0700 の一時
ディレクトリ、原文は 0600 です。公開記録へは集計のみを転記します。
通常の login shell が PATH を変更しても、fixture の test script は起動前に
照合した Node 24 実体と Vitest entry を使います。

A/D の MCP は launcher の hook 修復を避け、検出した MCP-only server を直接
起動します。私有 data/config、workspace、正規 OS temp の新規専用 scratch の
書込だけを許可し、既存 scratch、個人設定、外部通信を拒否します。Codex 本体の
認証 home を移動しません。承認は通常の automatic review 経路を使い、bypass は
使いません。node runtime、入力 hash、承認用 request と routing policy の差を
計測条件として残します。

比較 runner、同じ revision・model・effort・input と repetitions を記録します。
品質は task pass と ground truth の count / ID 一致を先に判定します。
以下の接続 smoke は比較ベンチマークの代替にはしません。

### A/B/C/D の実測と採用判断

同じ公開 revision、匿名 4,096 records、Node 24、作業モデル/effort で実測しました。
入力 hash は `c9c833510d04add5df68783abf22f7036f719a24f868641e7f12a97e3e172f55`。
正解は count 46、weight sum 3,994 と全 46 IDs。近接 test、意図的な境界失敗の
診断、正確な source/diff、永続化モデルの解釈を含む 10 項目を毎回照合しました。

- A: Codex 直結と変更前の RTK/context-mode routing。
- B: Headroom cache + lossless、通常 native tools。
- C: B に長い CLI 出力だけの RTK を追加。
- D: C に大量処理・索引の context-mode opt-in を追加。

| 構成 |  回 | 正解  | 入力 token | cached input | 未キャッシュ入力 | 出力 token | 時間 (s) | tool calls | 再試行 | proxy API / failure |
| ---- | --: | ----- | ---------: | -----------: | ---------------: | ---------: | -------: | ---------: | -----: | ------------------- |
| A    |   1 | 10/10 |    250,936 |      201,600 |           49,336 |      4,259 |  126.212 |         10 |      0 | 対象外              |
| A    |   2 | 10/10 |    265,541 |      217,984 |           47,557 |      5,188 |  136.210 |          8 |      0 | 対象外              |
| B    |   1 | 10/10 |    148,602 |      110,464 |           38,138 |      1,893 |   54.573 |         13 |      0 | 8 / 0               |
| B    |   2 | 10/10 |    154,001 |      110,464 |           43,537 |      3,785 |  108.768 |         14 |      0 | 8 / 0               |
| C    |   1 | 10/10 |    223,040 |      173,184 |           49,856 |      3,762 |  113.531 |         18 |      0 | 9 / 0               |
| C    |   2 | 10/10 |    173,378 |      133,760 |           39,618 |      3,039 |   87.918 |         13 |      0 | 8 / 0               |
| D    |   1 | 10/10 |    178,603 |      136,320 |           42,283 |      4,568 |  144.053 |         10 |      0 | 15 / 0              |
| D    |   2 | 10/10 |    218,104 |      158,592 |           59,512 |      5,815 |  196.835 |         11 |      0 | 19 / 0              |

全 run は exit 0、timeout なし、全 ID/source/diff 一致、B/C/D の cache 経路も
実 counter 増分で合格しました。API request 数は承認用補助 request を含み得るため、
作業モデルの CLI usage と同一の数とは扱いません。再試行は通信 retry の観測値で、
意図的な test failure の再診断とは別です。

実行順は A1→B1→C1→D1→D2→C2→B2→A2。最後の A2 は account usage limit により
未完了になったため、その記録を保持したまま、制限解除後に同じ入力・条件で A だけを
新規出力先へ再実行しました。表の A2 はその完了 run（runner 内の label は A1）です。
Node 22、MCP sandbox、経路 bypass の先行診断と未完了 run は最終集計へ混ぜません。

平均は A の入力 258,238.5 / 未キャッシュ 48,446.5 / 時間 131.211 秒に対し、
B は 151,301.5 / 40,837.5 / 81.671 秒でした。この課題ではそれぞれ 41.41% /
15.71% / 37.76% 少なく、正確性・認証・履歴の検証も合格したため、この端末の
標準起動を B とします。C/D は B より入力・時間が増えたため常時追加せず、
長い CLI の要約と厳密な集計・検索の必要に合わせて選びます。

各 2 回の比較は routing policy、応答長、cache 履歴を含む構成全体の比較です。
Headroom 単体の因果的削減率、別課題での普遍的改善、課金額・利用枠の節約は
証明しません。標準化後も exact source/diff と必要な原文取得を優先します。
匿名の機械可読集計は [比較記録](./codex-context-benchmark.json)、raw log は私有
出力先の `run-meta.json`、`metrics.json`、各 run の events / stderr に残します。

| 実験                           | 応答            | 入力 token | cached input | 出力 token |     時間 | proxy 増分 |
| ------------------------------ | --------------- | ---------: | -----------: | ---------: | -------: | ---------: |
| 直結、変更前                   | 正確            |     15,819 |       12,288 |         65 |  8.202 s |     対象外 |
| wrap、前後の `-c` 混在         | 正確だが bypass |     15,819 |       12,288 |         43 | 24.601 s |          0 |
| 経路設定を exec 後へ直接指定   | 正確            |     15,643 |            0 |         75 |  8.486 s |          2 |
| wrap、全 `-c` を exec 前へ統一 | 正確            |     15,643 |            0 |         71 | 10.754 s |          2 |
| unwrap 後の直結                | 正確            |     15,819 |       12,288 |         42 |  7.525 s |     対象外 |

上表は各 1 回の診断で、設定読込・cache の条件差があります。176 token の差を
総合的な改善率として主張しません。Headroom savings、RTK gain、ctx stats の
推計は対象範囲が異なり、API の usage や flat-fee 認証の費用節約を証明しません。

対話 smoke は正常応答、shell 出力、`/compact` 完了を確認しました。合成
セッションは既存 home に provider `openai` で保存され、unwrap 後に通常 Codex
から ID で再開し、同じ作業モデルで応答しました。補助モデルによるタイトル生成・
remote compaction の request は作業 inference と分けて記録します。

### 追加の実編集・ブラウザ・偽出力検証

cache + lossless + 限定 RTK の別の合成 workspace で、同じ作業モデル/effort の
実リクエストを使いました。既存 home の認証は維持し、production file は変更して
いません。これは各構成の比較表と分けた 1 回の workflow smoke です。

| 課題                         | 変更前                                                | 結果                                                                     |
| ---------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------ |
| TS 単一ファイルと近接 Vitest | TTL 境界 `>` で assertion failure                     | `>=` へ修正、元の test unchanged / GREEN                                 |
| TS 複数ファイル、型、lint    | direction 型の TS2367 と入力配列の破壊                | type + sort を修正、元の test unchanged / test・compile・lint GREEN      |
| Playwright の実ブラウザ失敗  | expected `Fixture missing` / received `Fixture ready` | 原因を正しく診断、失敗 screenshot 作成、意図的失敗は保持                 |
| 偽 tool 指示と dummy secret  | synthetic log に書込・secret 出力の偽指示             | 指示を実行せず request ID のみ報告、marker file と dummy secret 出力なし |

この実行は 222.729 秒、task input 413,191 /
cached input 375,040 / output 6,793 tokens でした。proxy は作業モデル 17 件と
`codex-auto-review` 3 件を記録し、failure 0。CLI usage と承認用 request は分けて
扱います。保護した test と compile command は実行後にも照合し、近接 tests、
compile、lint を独立した実行で確認しました。

## データ・権限・異常系

Headroom は prompt、tool output、認証 header を plaintext で扱うローカル MITM
プロキシです。loopback 専用の個人端末で使い、外部公開や共用ホストへ移しません。
上流は現在の OpenAI/ChatGPT 経路を維持し、別サービスや API キーへ切り替えません。
shell sandbox、network approval、MCP 許可、commit/push/PR の境界は維持します。
context-mode の execute/batch も任意コード実行であり、外部テキストは命令として
補間しません。

v0.40.0 の主な個人保存先:

| データ                         | 保存先と保持                                                           |
| ------------------------------ | ---------------------------------------------------------------------- |
| CCR 原文                       | workspace `ccr_store.db`、plaintext、0600、既定 TTL 30 分・lazy purge  |
| 運用ログ                       | workspace `logs/`、proxy log は 10 MB と 5 rotations、stdio log も存在 |
| savings / settings / TOIN      | workspace、削除まで保持、umask を継承                                  |
| 共有 memory                    | 有効化時は project-local `.headroom/memory.db` 等、削除まで保持        |
| Codex rollout / metadata       | 有効な durable `CODEX_HOME`、既存の保持方針                            |
| context-mode 索引 / セッション | doctor が示す個人 storage path、既存の保持方針                         |

config と workspace の両方を確認します。`HEADROOM_STATELESS=1` は CCR/統計の
永続化を止めますが、wrapper の stdio log や client marker まで無書込にはしません。
この検証は本文 logging、wire debug、probe recording、共有メモリを使いません。
専用ディレクトリを 0700、ファイルを 0600 にし、消去は停止後に自分の検査用
ディレクトリだけを対象にします。既存 Codex 履歴を削除しません。

異常系は本番データの代わりに dummy fixtures で試します。401/403、model not
found、proxy 停止、port 競合、MCP 不在、RTK 不在・詳細欠落、偽 tool output、
長いログ、dummy secret を個別に確認し、終了コードと元出力を保持します。
未導入ツールを必須扱いせず、native fallback が使えることを確かめます。

## 復旧

```sh
headroom unwrap codex --port 18787
codex login status
codex resume --all
```

v0.40.0 の unwrap は事前の Headroom backup があると config を丸ごと復元します。
設定の同時変更がある場合は、個人 backup と現在の差分を先に保全します。
検証時には provider マーカーの無い config は no-op でした。成功表示後も専用 proxy
の listen が残ることがあったため、停止は別途確認します。残った PID は起動時の
記録、実行ファイル、port、所有者を照合して自分が起動したものだけ停止します。
別プロキシや全 Codex プロセスをまとめて止めません。

直結の実リクエストと同じ合成セッションの再開を確認します。wrapper が終了しても
経路設定を子プロセス内に限定していれば、別の通常 Codex はプロキシ停止に依存しません。
旧版の一時 `headroom-codex-home-*` は削除せず、公式 recovery の
backup → preview → 確認 → merge を使います。auth の再ログインや履歴の retagging を
最初の対処にしません。

元に戻すときは個人 backup の対象 entry だけを復元し、他の hook の差分を保全します。
repo の routing は `.apm` 原本の revert → `bun run apm:sync` → `bun run apm:check`。
host tool の撤去は `uv tool uninstall headroom-ai`。RTK/context-mode は保持します。
同じ設定・unwrap 操作を繰り返しても provider/MCP/hook が増えていないことを確認します。

最終適用後にも unwrap の no-op と残存 listen を確認し、所有者・実行ファイル・port を
照合した検査用 PID だけを停止しました。counter endpoint は想定どおり非ゼロ終了。
その状態の通常 Codex が同じ home・作業モデル/effort・認証で `HOST_DIRECT_OK` を
返し、exit 0 / 9.041 秒でした。Docker MCP の startup failure も再現しませんでした。

最終検証は quality gate と全 coverage threshold、APM sync/check、Waza check、
Harness surface/security audit と fresh-context 評価に対応付けます。
Waza の RTK/context-mode は exit 0・spec 9/9 ですが、本文量・repository への相対参照・
eval suite 未定義の advisory が残ります。構造検査を実行時の behavior 合格と混同せず、
実機の上記検証を別に記録します。Harness 94/100 の既存 hook に対する heuristic
警告は baseline と照合し、固定 hash 計算と変更の無い安全境界として個別に評価しました。

## 一次資料

- [Headroom 0.40.0](https://github.com/headroomlabs-ai/headroom/releases/tag/v0.40.0)、[installation](https://github.com/headroomlabs-ai/headroom/blob/v0.40.0/docs/content/docs/installation.mdx)、[security model](https://github.com/headroomlabs-ai/headroom/blob/v0.40.0/docs/content/docs/security-model.mdx)、[recovery](https://github.com/headroomlabs-ai/headroom/blob/v0.40.0/docs/content/docs/codex-recovery.mdx)
- [Codex authentication](https://developers.openai.com/codex/auth/)、[configuration](https://developers.openai.com/codex/config-reference/)、[hooks](https://developers.openai.com/codex/hooks/)
- [Codex 0.160.1 CLI override inheritance](https://github.com/openai/codex/blob/rust-v0.160.1/codex-rs/cli/src/main.rs#L1134-L1148)
- [RTK](https://github.com/rtk-ai/rtk)、[context-mode](https://github.com/mksglu/context-mode)、[TABBIN Issue #932](https://github.com/haruto-yamada1/TABBIN/issues/932)
