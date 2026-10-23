# Release license audit — 2026-10-22

## Conclusion

以下は初回監査時点の不足の記録である。2026-10-23 の対策実装と検証は末尾を参照する。

PR #978 の Dependency Review 修正は技術的な CI 検証に合格したが、それだけでは
配布物のライセンス適合性を保証しない。現在の生成 ZIP は、第三者のライセンス原文・
著作権表示と MPL 対象コードのソース取得案内を補うまで、リリース可能とは判定しない。
今回の CI 修正による製品ソース・runtime dependency の変更はないため、これは
追加調査で判明した既存の配布手順の不足である。

この文書は原文と実物の技術的な照合結果を記録する。社内の CI 例外承認は、権利者からの
許諾や、あらゆる利用形態の法的適合性を代替しない。

## React Doctor の利用条件

ユーザーが確認した用途は **TABBIN のコード品質検査だけ**。

- 公式 npm の `react-doctor@0.9.16` と
  `oxlint-plugin-react-doctor@0.9.16` の tarball integrity と実 LICENSE を照合した。
  両方の metadata は `SEE LICENSE IN LICENSE`。両方の LICENSE の SHA-256 は
  `aa9b278de35d20d320e40789db8b3e242096ed4a89c5aaf8fbe23a5e55c08ff1`。
  標準 MIT と同じものとして扱わない。
- [権利者の解説](https://www.react.doctor/docs/legal/license)は、通常のプロジェクト・
  pipeline での実行を許可例として示す。
  [公式 agent 導入手順](https://www.react.doctor/docs/getting-started/install-for-coding-agents)も、
  Codex などが診断結果を受けて製品コードを修正する利用を案内する。
  この二つは、確認済みの TABBIN 品質検査用途が許可範囲にあるという判断を支持する。
- [実 LICENSE](https://github.com/millionco/react-doctor/blob/main/LICENSE)には、
  ソフトウェア・ソース等を AI の学習・調整・評価データや AI 改善用 pipeline に使う場合、
  および React Doctor 自体の価値に大きく依存する有料製品・サービスの提供について、
  書面許可を求める条件がある。モデル・prompt・skill・agent 自体の比較評価や改善に
  この例外を流用しない。
- 公式解説は出力も AI 評価の制限対象に含める一方、実 LICENSE は出力を明記せず、
  [上流 PR #935](https://github.com/millionco/react-doctor/pull/935)には出力の文言を
  削除した経緯がある。曖昧な AI 評価用途には、ローカル例外を根拠に許可済みと
  判断せず、用途を示した権利者確認が必要。
- `tools/codex-issues/runner.ts` の固定 grader と `quality:check` は Doctor を
  直接実行しない。ただし評価 workspace には Doctor の依存と skill が入るため、
  AI 評価との技術的な隔離までは保証していない。通常の製品レビューに診断結果を
  使うことと、AI system 自体の評価・改善に使うことを区別する。

README の MIT 表記や devDependency という分類だけを根拠に、追加条件を無視しない。
ツールの非同梱は配布範囲の証拠であり、開発中の利用条件を免除する理由ではない。

## 実際の配布物

既存の `wxt.config.ts` と同じ production 設定で WXT の `zip()` を実行し、
`build:done` の出力から chunk の `moduleIds` を取得した。監査用 hook はモジュールの
一覧を読み取るだけで、ビルド設定・モジュール・ZIP 内容を変更しない。

| Artifact           | Entries | SHA-256                                                            |
| ------------------ | ------: | ------------------------------------------------------------------ |
| Chrome extension   |     193 | `8f3876d26054929ee3a3fae85686292ff4af6546f0edfc1a94354835ac8e0ec9` |
| Firefox extension  |     193 | `dbecdaf2ce3fcad782f1bbe29ccfa34c810a0b76989da64cb53ec1ba3fd6b7c8` |
| Firefox source ZIP |     792 | `259a3c5543dc3ee7ceecc7ef95d034ee919d53705a380435f07a1c61cb7b637f` |

Chrome / Firefox とも176 chunks、2,300 distinct module IDs。
`react-doctor`、`oxlint-plugin-react-doctor`、`node-forge` は含まれない。
ZIP のファイル一覧と本文も検査し、当該ツールのパス・Modified MIT 本文の混入はない。
source ZIP の package.json / bun.lock に依存名があることは、本体の同梱を意味しない。

モジュールから確認した284の npm 配布物の内訳は、MIT 236、Apache-2.0 13、
ISC 24、BSD-3-Clause 5、BSD-2-Clause 1、0BSD 1、MPL/Apache 選択式1、
MIT/ISC 両条件1、MPL-2.0 1、metadata に license がないもの1。
内部の private subpath manifest は独立した npm 配布物に数えず、package root へ帰属させた。
これは module graph で見えた npm packages の調査であり、全 public assets・fonts・
vendored source の権利関係まで自動で証明するものではない。

## リリース前に解消する事項

1. **ライセンス原文・著作権表示の同梱**。
   Chrome / Firefox ZIP 内に、第三者の LICENSE / attribution 集約文書がなく、
   JS 本文にも MIT の許諾文、Apache / MPL 本文、著作権表示を確認できなかった。
   copyright という単語の一致は数式・言語ハイライト定義で、権利表示ではなかった。
   [MIT](https://spdx.org/licenses/MIT.html)の表示条件、
   [Apache-2.0 §4](https://www.apache.org/licenses/LICENSE-2.0)のライセンス・NOTICE 条件を
   各収録物に応じて満たす必要がある。SBOM の package 名だけでは代替できない。
2. **MPL 対象コードのソース案内**。
   `webextension-polyfill@0.12.0` は実際にバンドルされ、
   [実 LICENSE](https://github.com/mozilla/webextension-polyfill/blob/0.12.0/LICENSE)は
   MPL-2.0。両ブラウザの `chunks/browser-polyfill-D5J94II5.js` に、原本の固有の
   エラーメッセージと実装が残ることも確認したため、module graph に名前があるだけの
   推測ではない。配布 ZIP にライセンス本文や対象ソースの取得案内がない。
   [Mozilla FAQ Q8–Q11](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)に従い、
   対象版の対応するソースと利用者への案内を用意する。MPL を使うこと自体が禁止されたり、
   TABBIN 全体を MPL にする義務が直ちに生じる、という意味ではない。
3. **metadata だけでは分からない原文の確認**。
   `khroma@2.1.0` は package.json に license がないが、配布物の `license` は MIT。
   不明ライセンスを一括許可せず、このような原文と著作権者の情報を収録物に対応付ける。
   `dompurify@3.4.16` は MPL/Apache 選択式、`victory-vendor@37.3.6` は MIT AND ISC で、
   選択条件・vendored dependencies の notice も確認対象。

## 固定版を毎回修正しない運用

0.9.16 という番号自体を永続的な承認条件にする必要はない。承認対象を2つの package 名、
**承認済み LICENSE の bytes、用途、期限**にし、実際の version / integrity は毎回
`bun.lock` と exact-version npm metadata から検証する設計が適切。
同じ LICENSE のままの版更新では例外定義の手直しを不要にできる。

ただし、現在の実装はまだ exact version / integrity を固定する案のままである。
切り替える場合は、以下も同時に満たす必要がある。

- 別 registry、registry identity / integrity 不一致、全 nested resolutions の
  LICENSE 不明・変更、通信異常、期限切れを拒否する。advisory 検査は維持する。
- agent skill の `npx react-doctor@latest`、独立した React Doctor Action の install、
  ローカル CLI を同じロック済みの検証経路へ揃える。
- 実際の Doctor 実行前とリリース前にもライセンス検証を必須にする。現在は主に
  Dependency Review job と差分検査 CLI に限られ、`release:check` には入っていない。
- 30日期限は現行の例外方針によるため、版固定を外しても用途の再確認は残る。
  期限を自動更新して再確認を省略しない。

## 検証記録と限界

- 2026-10-22、両ブラウザの production build / extension ZIP / source ZIP 生成成功。
- `/private/tmp/tabbin-release-license-audit/` に module graph、ZIP 検査結果、npm package
  inventory と build log を保存。
- 前段の quality / coverage / CI audit 成功は、技術的な修正の証拠として維持する。
  本調査では製品コードや依存の解決を変更していない。文書の format / diff 検査を行う。
- clean-tree `release:check`、上記配布表示の修正、権利者への問い合わせ、commit / push は
  本調査では行っていない。リリース安全性の全項目が解消済みとは報告しない。

## 2026-10-23 の対策実装

- Doctor の承認対象を package 名・LICENSE bytes・品質検査用途・期限へ変更した。
  version / integrity は lockfile と exact-version registry metadata から取得し、
  未変更を含む全対象 resolution と installed copy を検証する。同じ LICENSE の更新では
  例外定義の変更は不要。非 npm source、identity / integrity 不一致、変更 LICENSE は拒否する。
- ローカル・agent は `bun run doctor` を使い、guard 後にそのローカル CLI だけを実行する。
  固定 SHA の公式 Action にも独立 install があることがレビューで判明したため、CI も
  wrapper の直接実行へ変更した。全 project の完了・score を検証し、100点の必須 gate を
  維持する。PR への結果投稿は、repository code を実行しない別 job へ分離した。
  checkout・patch guard・review の対象を同じ head SHA に揃え、Node は `.node-version` に従う。
- 実 build の module graph から、原文・著作権・vendored notices を決定的に生成する。
  標準 Apache の短い application notice は著作権表示を保持して標準全文を補完する。
  npm が原文を欠くものだけは、exact version / integrity と immutable provenance、
  原文 SHA-256 を持つ登録で補う。取得不能な npm gitHead については、公式 project-wide
  grant を採用した根拠・限界を登録へ明記し、新しい版には自動流用しない。
- MPL の preferred source は公式 commit と npm 配布物の source-map contents まで
  独立照合し、原本 archive と取得案内を runtime / source ZIP に同梱する。
  hash 不一致・欠落・別版を拒否する。source archive の SHA-256 は初回監査と同じ
  `bbd67713ead1cb7164ef2f18ab64de9468f2afc6c78ac53bb3dab7ea3044d8ca`。
- source ZIP の workspace / patch 欠落も修正した。実展開した ZIP で offline frozen
  install、prepare、Chrome / Firefox build、notice 検証が成功した。
  これは再ビルド可能性の確認であり、全リポジトリとのバイト一致を主張するものではない。
  自動 CSS discovery が参照する非製品ファイルの違いにより、未使用 utility と chunk hash に
  差が出ることを確認している。MPL 対象原本の一致とは別の検証である。
- 個別の回帰テストは、変更 LICENSE、未承認 variant、guard 失敗時の実行拒否、
  不完全な JSON report、古い PR head、未変更行への投稿、Markdown / mention の混入、
  原文・対応ソースの欠落・改変を扱う。実際のローカル full scan は100点。

全体 quality / coverage と、作業内容を複製した clean verification checkout の
`release:zip` が成功した。Chrome / Firefox の独立した2回の build では、ZIP bytes、
展開後の全 path / SHA-256、entry order が一致した。検証ログと対象 snapshot は harness に記録する。
CI 検査の成功を、未確認の利用形態や全 public / vendored assets の法的適合性の保証へ拡大しない。
用途はユーザーが確認した TABBIN 品質検査に限定する。
