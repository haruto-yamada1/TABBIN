# Mutation testing pilot

Issue #933 のローカル手動計測。通常の `test`、`test:coverage`、build と
`vitest.ci.config.ts` の閾値は変更しない。全 PR の必須 gate には含めない。

## 実行と生成物

`.node-version` の Node 24 と `.bun-version` の Bun 1.3.14 を使う。

```sh
bun install --frozen-lockfile
bun run test:mutation
```

HTML は `reports/mutation/index.html`、JSON は
`reports/mutation/mutation.json`。毎回 fresh run で上書きし、incremental cache は
使わない。コマンドは JSON の shape、異常 status、テストを実行していない
`Survived` を検査し、不正な計測なら exit 1 にする。score の下限 gate は設けない。

レポートには production source、変異後コード、test 名が含まれる。Git ignore した
生成 artifact としてローカルで読む。自動 upload / dashboard reporter / CI artifact
公開は設定していない。共有前に内容を確認し、個人のバックアップや実データを
fixture として追加しない。sandbox から `.env*`、recovery backup、エージェント設定、
既存 build / test 出力を除外する。

## 固定した toolchain と互換性 PoC

`@stryker-mutator/core` と公式 `@stryker-mutator/vitest-runner` はともに
10.0.0 を exact pin。実測した Vitest は5.0.3、TypeScript は7.0.2、Node は24.17.0。
Bun は install / script 起動に使い、Stryker と Vitest の worker は Node で実行する。
peer dependency が `vitest >=2.0.0` でも動作互換性の保証にはしない。

未修正 runner の PoC では nested test の filter が一致せず、明らかな変異まで
`testsCompleted: 0` の `Survived` になった。最初の239変異・score 12.97%の結果は
無効であり、テスト検出力の baseline として使わない。coverageAnalysis / related の
切り替えだけでも解消しなかった。

Vitest 5 の nested name separator `" > "` を受理し、名前の末尾を anchor する
[公式 upstream PR #6247](https://github.com/stryker-mutator/stryker-js/pull/6247)
の修正を、配布済み JavaScript へ Bun patch で適用した。patch は `patches/` と
`patchedDependencies` / `bun.lock` で固定する。通常の Vitest を downgrade しない。
更新時は upstream の取り込みを確認し、patch を外した実計測がゼロ件実行を含まず、
代表変異を kill することを確認する。JSON verifier も残す。

Dependency Review はこのレビュー済み追加を patch SHA-256、対象10.0.0、npm integrity
に固定して許可する。未知の追加や既存 patch の編集・削除は拒否し、Stryker の
advisory/license 検査も実行する。詳細は
[dependency review policy](../maintenance/dependency-review.md) を参照する。

Stryker の tsconfig rewriter は TypeScript 7 で削除された
`parseConfigFileTextToJson` を呼ぶため、初回 PoC が失敗した。
独立した `vitest.mutation.config.ts` で alias と純粋 node test を指定し、sandbox には
root tsconfig / `.wxt` をコピーしない。書き換える外部 references は不要で、
TypeScript checker plugin は使わない。通常の `bun run compile` が引き続き型を検査する。

## 対象と設定

source of truth は `stryker.config.mjs`。3 production files を対象にする。

| 対象                                                          | 計測する契約                                                                |
| ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/contexts/saved-tabs/domain/value-objects/Url.ts`         | runtime URL 検証、原文 identity の保持                                      |
| `src/lib/persistence/jsonValue.ts`                            | JSON に保存できる値、配列 index、ancestor cycle、列挙可能 property          |
| `src/features/options/lib/import-export/v2/BackupV2Schema.ts` | timestamp refinement と URL / collection / membership の lossless transform |

Backup schema は25–30、68–82、104–112、131–147行に範囲を固定した。
Zod discriminator の構築宣言は初期対象から除外する。これを変異させると import 時に
schema を構築できず、公式 runner が collection failure をゼロ件の survivor として
扱う場合があった。全ファイル pilot のその結果も有効な baseline に使わない。
範囲の除外理由は対象を実行可能な純粋関数へ絞るためで、score を上げるために
個別の生存 mutant を除外する設定や production の disable comment は追加しない。
production の行を変更したら、範囲とレポート上の source location を見直す。

worker は1、`coverageAnalysis: perTest`、`vitest.related: true`。
timeout は通常実行時間 × 1.5 + 5,000 ms + runner overhead、dry run は2分。
`.stryker-tmp` でコピー上を変異させ、`cleanTempDir: always` で成功・失敗時とも
今回の sandbox を片付ける。中断・強制終了後の残りも共有しない。

mutator の種類は default を維持し、種類による除外はない。今回発生した種類は
ArrowFunction、BlockStatement、BooleanLiteral、CallExpression、ConditionalExpression、
EqualityOperator、LogicalOperator、MethodExpression、ObjectLiteral、OptionalChaining、
Regex、StringLiteral、UnaryOperator。対象外は test / fixture、他の production files、
上記 schema 構築宣言。対象テストは config の4ファイルだけで、通常の project は変更しない。

## 初回計測と改善（2026-10-12）

production の起点は `ae97b493`。下表では production source と183個の変異セットを
同一に保ち、テストの assertion だけを改善した。所要時間は Stryker の表示値。

| 実行                              | Killed | Survived | NoCoverage | Timeout | Errors | 所要時間 |  Score |
| --------------------------------- | -----: | -------: | ---------: | ------: | -----: | -------: | -----: |
| 範囲限定後の baseline（68 tests） |    135 |       44 |          2 |       2 |      0 |     14秒 | 74.86% |
| 改善後（87 tests）                |    169 |       12 |          0 |       2 |      0 |     14秒 | 93.44% |

改善で32個の survivor と2個の no-coverage を kill した。代表例は以下。

| 生存していた変異                            | 不足していた検証                                           | 改善後 |
| ------------------------------------------- | ---------------------------------------------------------- | ------ |
| JSON array の `every` → `some`              | valid / invalid が混在する配列の拒否                       | Killed |
| array / object の `ancestors.delete` 削除   | 循環でない共有参照の受理                                   | Killed |
| `descriptor.enumerable` の検査を常に true   | 非列挙 property が JSON で失われる入力の拒否               | Killed |
| array index regex の anchor / digit 変異    | hidden `00` / `1 ` property の拒否                         | Killed |
| epoch の `value >= 0` → `value > 0`         | 0 と MAX_SAFE_INTEGER の受理・保持                         | Killed |
| optional metadata の spread 削除 / 常時追加 | favicon、provenance、category の保持と absent field の保持 | Killed |
| URL の runtime type guard の削除            | 非文字列が domain error で拒否されること                   | Killed |

Stryker に `Equivalent` status はなく、自動で同値と断定しない。確認済み equivalent は
0件。残る12 survivors のうち2件（array index の `<` → `<=` と descriptor の optional
chaining 削除）は通常の plain data では同値候補だが、Proxy / 極端な配列も含めた
同値性は未証明。残る10件は診断文言の変更や空 URL 拒否経路の変更で、受理・拒否の
判定は保っても観測可能な message が変わる。12件とも分母から除かず、除外していない。

Timeout の2件は cycle guard を外す変異。再帰が終了しなくなることを検出しているが、
assertion が kill した証拠とは区別する。score は Timeout も検出として数え、
assertion による killed の割合は169/183（92.35%）。高い score を正しさの保証にしない。

## 再現と比較

同じ revision、frozen lockfile、Node / Bun、config で2回実行し、各 JSON をローカルの
別名へ保存して比較する。ID や時間は比較キーにせず、file / location / mutatorName /
replacement の組と status を比較する。baseline と改善後でこの組が一致することも
確認した。HTML / JSON を git に追加せず、件数と調査結果だけこの文書に記録する。

改善前も再現する場合は、この PR の revision から専用の disposable worktree を作り、
3つの改善対象 test だけを起点の版へ戻して計測する。

```sh
git worktree add --detach .worktrees/mutation-baseline HEAD
cd .worktrees/mutation-baseline
git restore --source=ae97b493 -- \
  src/contexts/saved-tabs/domain/value-objects/Url.test.ts \
  src/lib/persistence/jsonValue.test.ts \
  src/features/options/lib/import-export/v2/BackupV2Schema.test.ts
bun install --frozen-lockfile
bun run test:mutation
```

元の作業 checkout で test を戻さない。baseline を再現したあと元の revision の
worktree で通常コマンドを実行すれば改善後を再計測できる。

## 解釈とトラブルシュート

- **Killed**: assertion が差異を検出した。failure を読んで意図した契約か確認する。
- **Survived**: 不足した assertion、未観測の診断、同値候補を調査する。
  `testsCompleted` が0または欠落なら計測は無効で、verifier が拒否する。
- **NoCoverage**: 選択テストがその変異箇所を実行していない。通常 coverage とは対象が違う。
- **Timeout**: 再帰・ループによる終了不能か、環境の遅延かを調査する。
  時間を無条件に伸ばして成功扱いにしない。
- **RuntimeError / CompileError / Pending**: この pilot では有効な計測に数えず、
  verifier が拒否する。schema 構築 failure、dependency、範囲、runner の互換性を調べる。
- **ゼロ件 filter / collection failure**: upstream
  [#6179](https://github.com/stryker-mutator/stryker-js/issues/6179) /
  [#6146](https://github.com/stryker-mutator/stryker-js/pull/6146) も参照する。
  worker の debug logging は config の循環参照で失敗する場合があるため、まず JSON の
  `testsCompleted` と通常ログを読む。ゼロ件を retry で隠さない。
- **`parseConfigFileTextToJson` がない**: root tsconfig を sandbox に戻していないか確認する。
  通常 TypeScript の downgrade / 型検査の無効化では対処しない。

導入後の必須 gate は通常どおり quality / coverage。計測を週次や PR gate に広げる判断は、
対象追加後の時間、残る survivor、runner の安定性を評価してから行う。
