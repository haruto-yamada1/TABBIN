# GitHub Actions 定義の監査

Issue #937 の Actions 専用 gate。Oxlint と Secretlint は従来どおり実行し、
YAML、GitHub 式、job / action の接続、inline shell、権限と外部入力を別に監査する。

## ローカルと CI の実行

Node は `.node-version`、Bun は `.bun-version` に合わせる。
Linux / macOS の x64 / arm64 をサポートする。`tar` が必要。

```sh
bun run ci:setup
bun run ci:lint
bun run ci:security
bun run ci:test
# low / informational も含めて調査する。finding があれば非ゼロ終了する。
bun run ci:security:report
# 特定 workflow に対しても同じ flag / 設定を使う。
bun run ci:lint .github/workflows/ci.yml
```

`ci:setup` は公式 GitHub Releases の配布物だけを取得し、
`tools/ci-audit/tools.json` の SHA256 と照合してから binary を展開する。
キャッシュ済み archive も毎回照合し、binary を再導入する。システムの別バージョンに
fallback しない。破損した archive は失敗するため、原因を確認して
`.cache/ci-audit/` を削除し `ci:setup` を再実行する。

| ツール     | 固定版 | 公式配布元                                                  |
| ---------- | ------ | ----------------------------------------------------------- |
| actionlint | 1.7.12 | https://github.com/rhysd/actionlint/releases/tag/v1.7.12    |
| ShellCheck | 0.11.0 | https://github.com/koalaman/shellcheck/releases/tag/v0.11.0 |
| zizmor     | 1.30.1 | https://github.com/zizmorcore/zizmor/releases/tag/v1.30.1   |

`ci:lint` は `.github/workflows/**/*.yml` / `*.yaml` を再帰的に検査し、
式の型、存在しない job / input / output、YAML と ShellCheck 診断を失敗にする。
ShellCheck の絶対パスを指定するため、未導入による黙示 skip はない。
Python の pyflakes 連携は対象外で、無効化を明示する。

`ci:security` は zizmor を `--offline --strict-collection --persona=pedantic`
で実行し、medium と high を失敗にする。high のみの最低要件より厳しい gate。
`.github/zizmor.yml` で GitHub 公式 action も含め full SHA pinning を要求する。
ローカル環境に token があっても offline を固定し、CI と同じ診断にする。
オンライン専用の owner / ref 履歴監査はこの gate の範囲外で、依存更新レビューで確認する。

`.github/workflows/actions-audit.yml` は workflow / auditor / 設定の変更 PR、
`develop` / `main` への該当 push、手動実行で同じコマンドを呼ぶ。
`pull_request` と `contents: read` を使い、checkout の credential persistence を
無効にする。secret、write token、`pull_request_target` を使わないため fork PR でも
実行できる。監査だけでは npm dependencies の install / lifecycle script は不要。

`ci:test` は導入時の archive 改ざん・binary 差し替え・未対応 platform の拒否テストと、
実 binary を使う integration pressure test。正常 fixture は成功し、
無効な式・job・action input・ShellCheck 違反、PR title の shell 補間、
write-all、credential persistence、未固定 action、危険 trigger は
対象 rule の診断と非ゼロ終了の両方を確認する。fixture は実行する workflow ではない。

## 初回 finding と例外

初回 triage は以下に記録する。重大 finding を baseline として黙認しない。
例外は rule 全体の disable や workflow 全体の ignore で作らず、必要な単一箇所を限定する。
例外を追加する場合は、同じ YAML comment に理由・対象 rule / step・期限
(`expires=YYYY-MM-DD`) を書き、この表にも remediation の予定を記録する。
期限切れは更新による延長前に再評価する。

| finding / 対象                                                                                      | 判断・対応                                                                                                                                      | 再評価期限 |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| excessive-permissions / React Doctor の issues・PR write と PR branch updater                       | workflow 全体から必要な job のみへ限定。既存コメント機能・更新機能を保持                                                                        | 解消済み   |
| undocumented-permissions / 上記 job と Waza PR read                                                 | 権限の使用理由を対象行に記録                                                                                                                    | 解消済み   |
| concurrency-limits / CI                                                                             | PR / branch 単位で旧 run を取り消す設定を追加                                                                                                   | 解消済み   |
| SC2016 / Waza summary                                                                               | Markdown code の意図しない shell 解釈警告を bold 表記で解消                                                                                     | 解消済み   |
| Firefox 実行パス取得 / CI                                                                           | command substitution を独立した代入へ変更し、失敗を伝播。空の path 成功を回帰テストで拒否                                                       | 解消済み   |
| Waza skill 入力 / real-agent workflow                                                               | grep の部分一致・regex 判定を完全一致 case に変更。改行や traversal も拒否                                                                      | 解消済み   |
| secrets-outside-env (auditor persona のみ、2 件) / Waza real-model job のモデル API key と sentinel | 手動・週次のみ、read-only 権限、fork PR 起動なし、対象 step の env 限定。専用 GitHub Environment の保護設定は別途検討。rule ignore は追加しない | 2027-01-11 |

`ci:security:report` は auditor persona で推奨事項も全件表示する。
上記 Waza の 2 件は通常 gate の pedantic persona が自動的に報告対象外とする
Environment 推奨であり、独自 suppression / baseline ignore は存在しない。
high / medium finding は pedantic gate で 0 件、low も修正済み。

上流の actionlint は外部 action の inputs / outputs を組み込みデータで確認し、
対応する major version ref の場合に限る。SHA ref の外部 action metadata は取得しない。
そのため input / output 拒否 fixture では major version ref を意図的に使用する。
実 workflow の SHA pinning は弱めず、SHA 更新時の action metadata / changelog 確認と
既存 React Doctor・Waza・Renovate 契約テストで補完する。workflow 自身の inputs、
step / job 参照、needs / output 接続、式、ShellCheck は通常どおり検査する。

## 更新手順

1. 上記公式 release の changelog、配布元、公開日時、権限 / 新しい rule を確認する。
2. `tools.json` の version、全対象 platform の asset 名と SHA256 を同時に更新する。
   GitHub Release API の asset digest を確認し、配布物の SHA256 を独立照合する。
3. `ci:setup` を実行して archive の取得・検証・各 tool の version を確認する。
4. `ci:lint`、`ci:security:report`、`ci:security`、`ci:test` を実行する。
   新規 finding を triage し、medium / high を解消する。
5. Waza、React Doctor、Renovate の契約テストと `quality:check` / coverage を実行し、
   macOS ローカルと Open PR の Linux CI で再現性を確認する。

Renovate の `helpers:pinGitHubActionDigests` と既存 runtime policy は維持する。
この manifest の native tool 更新は checksum の全 platform 同時更新が必要なため
手動 PR で行う。バージョンだけを自動更新して checksum と分離しない。

## rollback

監査 workflow と runner の追加を revert すれば従来 CI に戻る。
権限の最小化、credential persistence 無効化、既存 shell 修正は独立して維持できる。
ブラウザ拡張の storage / permission / data format は変更しない。

参考: [actionlint](https://github.com/rhysd/actionlint)、
[zizmor usage](https://docs.zizmor.sh/usage/)、
[zizmor rules](https://docs.zizmor.sh/audits/)。
