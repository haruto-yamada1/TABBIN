# Codex CLI の並列 worktree 運用

TABBIN の既存 Harness を、Issue ごとの Git worktree で最大 2 件まで並列に
使うための運用手順です。各 worktree の既存 Planner / Generator / Evaluator と
checkpoint を使います。個人の Codex 設定、MCP、plugin、hook は変更しません。
Headroom の採用条件と通常の復旧は
[コンテキスト最適化](codex-context-optimization.md)を参照してください。

## 起動と状態管理

すべての操作は同じリポジトリの checkout から実行します。

```sh
git fetch origin develop
bun run harness:worktree -- start --issue 941 --slug parallel-worktrees --dry-run
bun run harness:worktree -- start --issue 941 --slug parallel-worktrees
bun run harness:worktree -- status
```

`start` の起点は `origin/develop` 固定です。branch は
`codex/issue-<N>-<slug>`、配置先は primary checkout の
`.worktrees/issue-<N>-<slug>` です。slug は kebab-case を使います。
`--dry-run` で予定を確認してから開始できます。

Git の common directory に置く私有 registry と lock で、短い Git 操作と registry
更新を直列化します。長い install / APM 同期は専用 checkout で実行し、別 Issue
の終了記録を妨げません。既存 branch、worktree、未保存変更を上書きしません。
`ready` / `running` / setup に失敗した `failed` の上限は 2 件で、上限を増やす設定はありません。
`paused` / `finished` でも worktree、branch、slot の予約を保持します。

最初に既存の Harness run を初期化し、`bun install --frozen-lockfile` →
`bun run apm:sync` → `bun run apm:check` でセットアップします。途中で失敗しても
同じ run で pause / cleanup でき、pause 後の resume も setup を再試行します。
各 checkout の `.agents/harness/ACTIVE` と run directory は共有しません。
依存パッケージの共有 cache は再利用できますが、`node_modules` を他の
checkout への symlink にしてはいけません。

`status` は managed task に加えて、未管理 worktree と、registry に記録が
あるのに見つからない worktree も表示します。表示だけで既存 checkout の登録、
修復、削除は行いません。
上限は helper の管理対象に適用します。未管理 checkout の実行状況は開始前に
別途確認し、既存作業を自動登録しません。TypeScript、Vitest / coverage、format、
lint、Knip、secretlint は子 `.worktrees/` を対象から外し、各 checkout 内で検査します。

```sh
bun run harness:worktree -- pause --issue 941
bun run harness:worktree -- resume --issue 941
bun run harness:worktree -- finish --issue 941 --pr https://github.com/owner/repo/pull/123
```

`pause` / `resume` は既存 Harness に checkpoint を残し、dirty な差分も
保持します。セットアップの途中で失敗した task は、`resume` で install と
APM 同期・検証を再試行します。別の branch や新しい Harness run に逃がしません。
`finish` は PR URL を追跡記録する操作です。GitHub への書き込み、commit、push、
PR 作成、merge、close、approve は実行しません。

## checkout ごとのコマンド実行

```sh
bun run harness:worktree -- exec --issue 941 --tool codex
bun run harness:worktree -- exec --issue 941 --tool headroom
bun run harness:worktree -- exec --issue 941 --tool dev
bun run harness:worktree -- exec --issue 941 --tool storybook
bun run harness:worktree -- exec --issue 941 --tool quality
bun run harness:worktree -- exec --issue 941 --tool coverage
bun run harness:worktree -- exec --issue 941 --tool e2e -- --workers=1
```

`exec` は task の checkout を cwd にして、選択された既知の binary / script を
shell なしで起動します。追加引数は `--` の後に渡します。shell の pipeline、
リダイレクト、コマンド置換を実行する入口ではありません。開始時と終了時に
checkpoint を記録し、実行中は同じ task の別操作を拒否します。

各 slot の port は次の式で決まります。既存 listen を実際に調べ、競合時は
起動を拒否します。dev は strict port を使い、別の port への自動変更を許しません。

| tool      | port                | slot 0 の例 |
| --------- | ------------------- | ----------- |
| Headroom  | `18780 + slot * 10` | `18780`     |
| dev       | `13700 + slot * 10` | `13700`     |
| Storybook | `16700 + slot * 10` | `16700`     |

Headroom は task 専用の port、workspace、config を使います。固定 port / state を
設定し直すことがある個人の `codex-headroom` launcher は使いません。
先に `headroom proxy --host 127.0.0.1 --port <専用port> --mode cache` を起動し、
health の PID と cache mode が自分の proxy に一致することを確認します。その後
`headroom wrap codex --port <専用port> --code-memory none --no-mcp --no-proxy` を
起動し、port の自動変更や別 proxy の再利用を防ぎます。終了時は自分が起動した
process group だけを停止します。
loopback、cache + lossless、本文 logging / wire debug / probe recording 無効の
契約を維持します。別 task の proxy を再利用して経路検証や計測を済ませません。

`exec` が子プロセスに渡す設定は checkout と task の私有 runtime に限定します。

| 対象         | 保持または分離するもの                                          |
| ------------ | --------------------------------------------------------------- |
| Codex        | durable `CODEX_HOME`、既存認証・model・effort・approval を保持  |
| hook         | `CLAUDE_PROJECT_DIR` を実際の checkout に合わせる               |
| Headroom     | workspace / config / port を task ごとに分離                    |
| context-mode | project / data / scratch を子プロセス専用の設定にする           |
| Serena       | 各プロセスの project を checkout の絶対 path と照合             |
| RTK          | 明示利用を維持し、共有 `gain` を task ごとの token 統計にしない |

Codex の起動前に `codex mcp list --json` を非表示で取得し、`serena` と
`context-mode` / `context_mode` の cwd / project / runtime env を `-c` でその
プロセスにだけ渡します。Serena は `start-mcp-server` の `--project` を専用
checkout に合わせます。context-mode は installed な `node` / `bun` と絶対
`context-mode/.../build/server.js` の直接起動を許可します。個人 hook を修復する
launcher や共有 HTTP MCP は起動を拒否し、設定を変更しません。

これら以外の MCP / plugin 名は自動変更しません。別名の登録や非対応版では
project の対応を先に確認し、native tools または task 専用設定で進めます。
追加引数で cwd / config / profile / sandbox / approval を上書きすることは
この helper ではできません。個人設定の更新は並列実行を止めて別途行います。
[公式の設定優先順位](https://developers.openai.com/codex/config-advanced/)と
[MCP 設定](https://developers.openai.com/codex/config-reference/)も参照してください。

## 保持、停止、cleanup

registry、runtime、trace、Harness archive は私有データです。所有者だけが
読める directory / file に保存し、secret、環境変数の値、`auth.json`、実会話を
公開ログ、Issue、PR、repository に転記しません。trace に task の本文や
コマンド引数を無条件に保存しないでください。Codex の既存 rollout と履歴は
durable `CODEX_HOME` の保持方針に従います。

通常の中断は、その `exec` を起動した terminal で Ctrl-C を使います。
自分の実行だけを停止し、終了 checkpoint と `status` を確認します。
SIGKILL や端末障害の後は、registry の owner / child PID と実際の liveness、
実行ファイル、cwd、port を照合します。残ったプロセスを停止する判断は人間が
行います。全 Codex / Headroom process の一括停止、PID の一致だけによる停止、
残った lock の自動削除は行いません。

```sh
bun run harness:worktree -- status
bun run harness:worktree -- cleanup --issue 941 --confirm 941
```

`cleanup` は Issue 番号の一致、clean な working tree、idle な task を確認して
実行します。未知の ignored file や secret がある場合も拒否します。
削除できるのは helper が列挙した既知の生成物だけです。生成物 directory に
個人データを置かず、未知のファイルは自分で別の私有保存先へ退避してください。
Harness は Git common directory の私有 archive に保存してから checkout を
除去します。branch は削除しません。元の Codex 履歴や別 task の runtime も
削除しません。

## 2 worktree での再現手順

以下はローカルの再現用例です。Issue 番号と slug は既存 task と衝突しない
値に置き換えます。GitHub の Issue は作成されません。確認用ファイルを消す
操作は、この手順で作ったものだけを対象にします。

1. primary checkout の位置と、変更前の状態を確認します。

   ```sh
   primary_root="$(git rev-parse --show-toplevel)"
   git status --short
   bun run harness:worktree -- status
   ```

2. 2 つの terminal で、同じリポジトリから `start` を同時に実行します。
   lock が重なった操作を拒否するので、busy になった側だけ先行操作の終了後に
   再実行し、2 task がそれぞれ ready になることを確認します。

   ```sh
   bun run harness:worktree -- start --issue 10001 --slug parallel-repro-a
   bun run harness:worktree -- start --issue 10002 --slug parallel-repro-b
   bun run harness:worktree -- status
   ```

3. A だけに確認用の編集を作り、B の working tree と Harness に混ざらない
   ことを確認します。各 `.agents/harness/ACTIVE` の指す run も独立している
   ことを確認します。

   ```sh
   task_a="$primary_root/.worktrees/issue-10001-parallel-repro-a"
   task_b="$primary_root/.worktrees/issue-10002-parallel-repro-b"
   printf 'parallel worktree check\n' > "$task_a/docs/parallel-repro-a.txt"
   git -C "$task_a" status --short
   git -C "$task_b" status --short
   ```

4. それぞれの terminal で frozen install を実行します。共有 cache を使っても
   `node_modules` と lockfile は checkout ごとに独立していることを確認します。
   依存更新を試す場合は A だけで、既存の依存更新手順に沿って `package.json` /
   `bun.lock` を更新し、B に差分が出ないことを確認します。別 task の lockfile を
   コピーして揃えません。

   ```sh
   (cd "$task_a" && bun install --frozen-lockfile)
   (cd "$task_b" && bun install --frozen-lockfile)
   git -C "$task_a" diff -- package.json bun.lock
   git -C "$task_b" diff -- package.json bun.lock
   ```

5. A を pause → resume し、確認用の編集と同じ Harness run が保持されることを
   確認します。setup 失敗の再現では、再現専用の環境で install または APM の
   エラーを起こし、原因を解消して `resume` が setup を再試行することを確認します。

   ```sh
   bun run harness:worktree -- pause --issue 10001
   bun run harness:worktree -- resume --issue 10001
   git -C "$task_a" status --short
   ```

6. dirty な A の cleanup が拒否され、確認用ファイルも checkout も残ることを
   確認します。次に確認用ファイルだけを消し、ignored な dummy recovery file
   でも cleanup が拒否されることを確認します。依存更新を試した場合は、その
   差分を先に保存・処理してください。

   ```sh
   bun run harness:worktree -- cleanup --issue 10001 --confirm 10001
   test -f "$task_a/docs/parallel-repro-a.txt"
   rm "$task_a/docs/parallel-repro-a.txt"
   printf '{"dummy":"retention-check"}\n' > "$task_a/parallel-cleanup-canary.recovery.json"
   bun run harness:worktree -- cleanup --issue 10001 --confirm 10001
   test -f "$task_a/parallel-cleanup-canary.recovery.json"
   ```

7. 自分が作った dummy file を消し、clean / idle を確認して cleanup します。
   archive が残り、branch が残り、B の checkout と差分に影響がないことを
   確認します。B の後片付けも、同じ確認と番号の指定を行います。

   ```sh
   rm "$task_a/parallel-cleanup-canary.recovery.json"
   git -C "$task_a" status --short
   bun run harness:worktree -- cleanup --issue 10001 --confirm 10001
   bun run harness:worktree -- status
   git show-ref --verify refs/heads/codex/issue-10001-parallel-repro-a
   git -C "$task_b" status --short
   ```

commit / push / PR / Issue 作成はそれぞれユーザーの明示依頼を必要とします。
Harness の状態や `finish` の記録を、公開操作の許可として扱いません。
