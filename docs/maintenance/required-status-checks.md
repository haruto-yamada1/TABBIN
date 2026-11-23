# Required status checks の運用

GitHub の [protect-develop](https://github.com/haruto-yamada1/TABBIN/rules/13234086) と
[protect-main](https://github.com/haruto-yamada1/TABBIN/rules/13233876) がマージ条件を管理する。
この文書はチェックの契約と切り戻し手順を記録する。設定の実効値は GitHub の Rulesets で確認する。

## 必須チェック

Dependency Review を追加した構成では、両ブランチで GitHub Actions（App ID `15368`）が発行する次のジョブ名を指定する。

| チェック                 | 成功条件                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `Lint & Type Check`      | toolchain、依存監査、型、format、lint、アーキテクチャなどの検証を通過                                             |
| `Verify Build`           | Chrome / Firefox のビルド、配布物・互換性検証、初期ロード計測を通過                                               |
| `Run Vitest Tests`       | 上流の `Coverage Thresholds` が `success`。上流が失敗した場合は集約ジョブも失敗                                   |
| `React Doctor Score 100` | 全体のスキャンが完了し、100/100 を取得。PR へのレビュー投稿は別ジョブ                                             |
| `Dependency Review`      | patch、承認済みライセンス、Bun の解決依存差分、GitHub Dependency Graph などの検査を通過。依存変更のない PR も実行 |

`main` は最新 base での再検証が必須。`develop` は最新 base との同期を必須にせず、
[Update PR Branches](../../.github/workflows/update-pr-branches.yml) が同一リポジトリの対象 PR を更新する。
Renovate、fork、draft は自動更新の対象外。両 Ruleset は active で、PR 経由の変更、レビュー会話の解決、
削除・force push の禁止を適用する。2026-11-23 の Ruleset に bypass actor の登録はない。

## 結果が返らないとき

- [Dependency Review workflow](../../.github/workflows/dependency-review.yml) は
  `develop` / `main` 向けの `pull_request` を使う。job レベルの条件、path filter、
  Renovate や fork による除外を付けない。ライセンス違反や検査サービス障害は失敗として扱う。
  [依存ポリシー](dependency-review.md)
- 最新 head の PR Checks を使う。GitHub が test merge commit の結果を表示する場合は
  その結果を確認する。サービス障害やキャンセルは該当する実行を再実行する。
  merge conflict がある場合は解消して head を更新する。base の変更や skip 指示で
  workflow が起動しなかった場合は、対象 base に向けた新しい head 更新で実行を確認する。
- fork は `contents: read`、追加 secret なし、checkout credential の保存なしで同じジョブを実行する。
  現行の Actions 設定 `first_time_contributors` で承認待ちになったら、差分を確認した書き込み権限者が
  PR 画面の **Approve workflows to run** を使う。自動ブランチ更新後も `GITHUB_TOKEN` 由来の
  workflow が承認待ちになる場合は、同じ画面で承認する。
  [fork の実行承認](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/approve-runs-from-forks)、
  [自動更新後の実行承認](https://docs.github.com/en/actions/concepts/security/github_token)
- GitHub は workflow 全体が未実行ならチェックを待ち続け、job の `skipped` / `neutral` は合格扱いにする。
  必須 job に PR 種別やパスによる除外を設けず、上流ジョブで拒否した場合はその失敗を伝える。
  必須名は workflow 間で一意にし、workflow や検査スクリプトの変更時は同じ名前で検査が完走することを
  レビューする。App ID で発行元を固定し、workflow の識別には workflow ファイルと run を照合する。
  [GitHub の必須チェック仕様](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks)

## 適用と復旧

1. Settings → Rules → Rulesets、または
   [Rulesets API](https://docs.github.com/en/rest/repos/rules#update-a-repository-ruleset) で対象を確認する。
   API では `GET /repos/haruto-yamada1/TABBIN/rulesets/{id}` の結果を退避する。
   PR に紐づく最近の成功 run の Check Runs API で `name` と `app.id` を照合する。
2. Open PR の最新チェックを確認してから、`protect-develop`、`protect-main` の順に
   `required_status_checks.parameters.required_status_checks` へ
   `{"context":"Dependency Review","integration_id":15368}` を追加する。
   API で更新する場合は最新設定を読み取り、該当する配列にだけ追記する。
3. `GET /repos/haruto-yamada1/TABBIN/rules/branches/{branch}` で各ブランチへの適用を確認する。
   退避した設定と比較し、既存4件、strict 設定、ref 条件、bypass 一覧、PR 保護を確認する。
   PR の Checks または `gh pr checks <番号> --required` で必須表示を照合する。
   失敗と未実行は GitHub の必須チェックとしてマージを止める。検証にはマージ操作を必要としない。
4. job 名の移行は、新しい名前を両 base 向け PR で成功させ、既存名と並行して結果を返せることを
   確認したうえで、Ruleset の参照を切り替える。チェックが欠け続ける場合は、実行承認、
   conflict、対象イベント、path filter、job 名と App を確認する。
5. 設定追加が原因で復旧が必要な場合は、GitHub の管理者が最新の Ruleset を取り直し、今回追加した
   `Dependency Review` の行だけを外す。退避内容と実効ルールを比較して他の保護を確認する。
   影響した PR、原因、解除時刻を Issue に記録し、修正後の成功 run を確認して再適用する。

## 2026-11-23 の確認結果

| PR               | 結果                                                                                                                                                                                                                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 通常             | `develop` の docs 更新 [#1093](https://github.com/haruto-yamada1/TABBIN/actions/runs/44974882718/job/137062433257)、`main` の release [#1007](https://github.com/haruto-yamada1/TABBIN/actions/runs/40900066836/job/123540169497) で成功                                                                  |
| 依存ポリシー違反 | `develop` の [#1005](https://github.com/haruto-yamada1/TABBIN/actions/runs/40862175547/job/123407879658) で許可外ライセンス、`main` の [#978](https://github.com/haruto-yamada1/TABBIN/actions/runs/39676837834/job/119488812889) で未承認 patch とライセンスを検出し失敗。既存 run と回帰 fixture で検証 |
| Renovate         | [#949](https://github.com/haruto-yamada1/TABBIN/actions/runs/45097618542/job/137440854284) と [#983](https://github.com/haruto-yamada1/TABBIN/actions/runs/45097610780/job/137440829736) で成功                                                                                                           |
| fork             | Actions の承認設定と read-only の workflow 契約を確認。実 fork PR は未検証。別の所有者の fork から文書のみの PR を作り、承認待ち、承認後の成功、必須表示を確認する                                                                                                                                        |

11/18〜11/23 JST の完了済み PR workflow を各25 run 抽出し、run ごとの最新 attempt を集計した。
同じ PR の複数の head を含む。実行時間は成功ジョブの開始から完了まで、待ち時間込みは
workflow 作成からジョブ完了まで。

| チェック                      | 成功／失敗／取消 | 実行時間中央値 | 待ち時間込み中央値 | 判断                                                                                                                        |
| ----------------------------- | ---------------- | -------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Dependency Review             | 24／1／0         | 17秒           | 約23秒             | 必須化。1件は当時の[依存ライセンス拒否](https://github.com/haruto-yamada1/TABBIN/actions/runs/44971880006/job/137053244050) |
| E2E Accessibility (axe)       | 25／0／0         | 4分05秒        | 4分20秒            | 任意で観測を継続。数週間の失敗原因・再現性と追加待ち時間を確認し、安定していれば次の候補にする                              |
| Saved Tabs Performance Budget | 24／0／1         | 15分21秒       | 約16分08秒         | 任意を維持。ランナー上の計測ばらつきと待ち時間を評価してから再判断する                                                      |

既存の必須 CI 3件が通った11 run では、それらの最後の完了より axe が遅かったのは1件で11秒。
Performance Budget は成功した10件すべてで遅く、最長13分19秒の差があった。
別 workflow の React Doctor は比較に含めていないため、追加のマージ待ち時間の上限として扱う。
公開リポジトリの標準 GitHub-hosted runner は無料で、必須化によるジョブ追加はない。
[GitHub Actions の料金仕様](https://docs.github.com/en/billing/concepts/product-billing/github-actions)

[Actions Definition Audit](actions-audit.md) は paths によって workflow 全体が省略されるため、現行名で
必須化すると対象外の PR が pending になる。候補にする際は全 PR で結果を返す集約ジョブを設計し、
対象内では監査の成功、対象外では対象外の判定が正常だったことを確認して成功を返す。
監査の失敗・実行漏れを拒否できることを正常系と異常系で検証してから設定する。
