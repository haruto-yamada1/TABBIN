# Chrome / Firefox ビルドの再現性

同じ commit と toolchain から独立した 2 回のビルドを行い、配布 ZIP の SHA-256 と
展開後の各ファイルのパス・SHA-256 を比較します。初期運用は手動／リリース前の観測です。
CI の必須 gate や `release:zip` の一部にはしていません。

## 実行

`.node-version` の Node major と `.bun-version` の Bun を PATH 上に用意します。
Node は major だけでなく実際の patch version もレポートに記録します。

```sh
bun run release:reproducibility
# 過去の確定 SHA も指定可能（この checkout の検証スクリプトで測定）
bun run release:reproducibility --ref <commit-sha>
# 保管先を変える場合
bun run release:reproducibility --ref <commit-sha> --output /tmp/tabbin-repro
```

既定の対象は `HEAD` の commit です。未 commit の編集や ignored file は入力になりません。
対象 SHA をそれぞれ別の Git repository に depth=1 fetch し、独立した object database と
`node_modules` で `bun install --frozen-lockfile` → `zip` → `zip:firefox` を順次実行します。
共有されるのは依存パッケージ取得用の Bun cache だけです。checkout、WXT cache、
`.output`、ブラウザ profile を共有しません。

環境変数は PATH・HOME・TMPDIR と明示した `TZ=UTC`、`LANG=C`、`LC_ALL=C`、`CI=true`
だけを子プロセスに渡します。認証 token や呼び出し元の `VITE_*` / `WXT_*` / build flag は
引き継ぎません。HOME は Bun の cache／通常の設定解決に残るため、完全な hermetic build や
異なる OS／runner 間の再現性を証明するものではありません。必要なら別の runner でも同じ SHA を測定します。

各回で production logging、app version、Persistence compatibility、network policy、Firefox
artifact の既存 verifier を実行し、元の Provenance / SBOM を生成します。
ビルド後の tracked / untracked source 変更、異なる SHA／lock hash／runtime、ビルドや
verifier の失敗は比較成功として扱いません。元 checkout の依存や編集は変更しません。

## 出力と判定

`.output/reproducibility/<sha-prefix>-<unique>/` に次を残します。

- `report.md`：ブラウザ別の ZIP byte 一致、内容一致、entry 順序、変更パス。
- `report.json`：同じ判定、両 ZIP hash、全ファイル hash／サイズ、Manifest、ZIP entry の
  DOS timestamp／圧縮 metadata、実 runtime、lock hash、実行 command、既存 size collector の結果。
- `a/`、`b/`：独立 checkout と各 `.output/` の無加工 ZIP・sources ZIP・SBOM・Provenance。
- `a.log`、`b.log`：install / build / verifier のログ。失敗時も保存されます。

比較器は重複パス、危険なパス、暗号化／symlink entry、破損 CRC／サイズ、
local／central header の不整合を拒否します。ZIP64／複数 disk は非対応です。
local header だけの timestamp 差も記録し、ZIP 内容はディスクに展開しません。

ログと checkout にはローカル絶対パスが含まれることがあるため、保管・共有時は確認します。
レポート自体はユーザー名、HOME、認証情報を収集しません。生成物は Git に commit しません。
再現性を再調査する間は保持し、不要になった実行 directory だけを手動削除してください。

| 観測                                                | 許容基準と次の対応                                                                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| ZIP と内容が両方一致                                | 同一 SHA／記録した toolchain・環境での byte reproducibility の証拠。別環境にも一般化しない。                                   |
| ZIP のみ不一致、全パスと内容 hash は一致            | 内容同等の候補。順序、DOS timestamp、圧縮 metadata を調べ、理由を記録して判断する。元 ZIP を保持し、再圧縮して一致を作らない。 |
| パスまたは内容 hash が不一致                        | 内容同等とは扱わない。Manifest、Persistence metadata、chunk naming、source map、埋め込み日時等の変更パスを調査する。           |
| install / build / verifier / 入力同一性の検証が失敗 | 比較不能。成功した一致とは報告せず、ログの原因を解消して新しい実行を作る。                                                     |

コマンドは全ファイルの内容一致で exit 0、内容差分で exit 1 にします。ZIP byte 差だけでは
非ゼロにせず、レポートに必ず残します。これは手動調査の判定で、配布許可ではありません。
「内容一致」は機能的同等性の保守的な指標で、ブラウザ E2E や動作保証を代替しません。
Manifest JSON の整形、chunk hash、source map 等を正規化・除外しないため、正当な環境差でも
内容差として残り得ます。理由が不明な差を allowlist に入れません。

## 現行実装で確認した非決定要因と境界

対象の toolchain は `.node-version`、`.bun-version`、`bun.lock` が原本です。
WXT / Vite の実バージョンも各独立 install 後に記録します。

- WXT 0.21.4 は ZIP entry をソートし、zero-zip 1.0.1 は DOS date/time をゼロにします。
  追加の ZIP 正規化は不要です。圧縮は Node zlib に依存するため、Node patch／OS 差は
  実測して判断します。順序・timestamp・圧縮差は比較器の regression test で検出します。
- production source map は既定で無効、chunk は内容 hash 名です。実生成物の全パスと
  hash を比較するため、source map が追加されれば比較対象になります。
- Manifest version は `package.json` から生成されます。Manifest と `persistence-release.json`
  も通常のファイルとして厳密比較し、既存の検証と IndexedDB 互換性の契約を維持します。
- 現行設定に build-time の外部 font／HTTP resource download は確認されません。
  frozen install は registry／Git dependency と cache に依存します。完全な offline／
  supply-chain 検証を証明しません。WXT は `.env*` を読むため、ローカル ignored `.env` を
  含まない commit checkout を使い、将来 tracked な build input を追加したら再調査します。
- ブラウザ profile は使いません。一時生成物は独立 checkout 内に閉じます。
- Firefox 提出用 sources ZIP の単独再ビルドは今回の比較対象外です。現行 allowlist は
  workspace `tools/legacy-tooling`、`patches`、`bunfig.toml` を含まないため、提出 sources
  だけからの frozen install／再ビルドには不足があり得ます。配布 ZIP の二回比較と区別し、
  sources の自己完結性は別途検証する follow-up 候補です。

## 配布 ZIP、SBOM、Provenance、size report の対応

各 build の `{appName}-{version}-build-metadata.json` は、その build の Chrome／Firefox ZIP
**そのもの**の SHA-256、git SHA、lock hash、version file の runtime 指定と SBOM filename を
記録します。配布時は選んだ build の ZIP と同じ sidecar を組にして保持し、その hash を照合します。
別 build の byte が一致しなければ、その sidecar を流用しません。

SBOM は CycloneDX 1.6 で lockfile の依存と installed package metadata を列挙する資料です。
実際の bundle に含まれるコード一覧や全推移 production dependency の到達可能性を証明する
ものではありません。SBOM の UUID／生成時刻と Provenance の `buildTimestamp` は実行ごとに
変わる正当な差なので、これらの sidecar の byte 一致は要求しません。元の生成器を変更せず、
比較レポートには各 SBOM hash と元 Provenance を残します。

既存 Provenance は sources ZIP と SBOM 自身の hash を記録しません。今回の JSON にある
SBOM hash は比較証跡であり、既存署名／attestation の追加を意味しません。Store が再署名・
再圧縮した最終配布物の一致も対象外です。

サイズは既存 `collectArtifactSize` を再利用します。size report は増減観測、Provenance は
配布物への追跡、今回のレポートは独立 build 間の同一性で、それぞれの役割を保ちます。
安定した測定の蓄積後に gate 化を別途判断します。

## 初回の実測（2026-10-14）

対象 commit は `75389a7228c3e471c02c47d8b219fb5bcf53010e`、Node `v24.20.0`、
Bun `1.3.14`、WXT `0.21.4`、Vite `8.3.2`、macOS arm64 です。
lock hash は `971c77e5a70ceef1f784e1a5bd10276d9de68b2d187c02ff4ed12054a57b8f9f`。
独立した二回の checkout／install／ZIP／verifier／Provenance 生成が成功しました。

| Browser | ZIP bytes | 展開後 files | ZIP / 内容 / 順序 |
| ------- | --------- | ------------ | ----------------- |
| Chrome  | 2,164,356 | 192          | すべて一致        |
| Firefox | 2,164,378 | 192          | すべて一致        |

Chrome ZIP SHA-256: `7f03913be5e8d62413605463fc885101de305be1b22c7de35f758f600088b336`。
Firefox ZIP SHA-256: `24956c184d97829ef16d1e9fa8d34f6a8c5d6f4eeb7f867677eaeea2cafea6db`。
両ブラウザで source map は 0、ZIP timestamp／圧縮 metadata 差も 0 でした。
Manifest と Persistence metadata も一致し、SBOM は想定どおり UUID／時刻によって byte が異なりました。
この結果は記載した環境での観測であり、別 OS／Node patch や将来の commit の保証ではありません。
