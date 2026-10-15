# リリース手順

## バージョン更新

拡張機能のバージョンは `package.json` の `version` を authoritative source とする。
リリース前に `package.json` の `version` を更新するだけでよく、`wxt.config.ts` やバックアップコードに version literal を重複定義する必要はない。

## 事前チェック

配布前に clean な checkout で品質、ビルド、主要 E2E を確認します。
Node / Bun は `.node-version` / `.bun-version` に合わせ、依存関係を frozen install
してください。ブラウザと geckodriver の準備は初回に行います。

```bash
bun install --frozen-lockfile
bunx playwright install chromium firefox
```

`geckodriver` を PATH に置くか `GECKODRIVER_PATH` に実行ファイルを指定します。
CI の Firefox job は checksum 検証付きの geckodriver v0.37.1 を使っています。
Firefox を自動検出できない環境では `FIREFOX_EXECUTABLE_PATH` を指定します。
Playwright の Firefox を使う場合は次のように設定できます。

```bash
export FIREFOX_EXECUTABLE_PATH="$(bun -e 'import { firefox } from "@playwright/test"; console.log(firefox.executablePath())')"
```

準備後に実行します。

```bash
bun run release:check
```

このコマンドは以下の流れで実行されます：

1. `bun run quality:check` — フォーマット、lint、テスト、重複チェックなど
2. `bun run build` — Chrome 拡張機能のビルド
3. `bun run build:firefox` — Firefox 拡張機能のビルド
4. `bun run verify:production-logging` — production build から console / debugger が除去済みであること
5. `bun run verify:app-version` — 生成された manifest version が package.json と一致することを確認
6. `bun run verify:persistence-release-compatibility` — 生成された artifact の Persistence v2 compatibility metadata を検証
7. `bun run verify:production-network-policy` — 生成された manifest の host / CSP / permission 契約を検証
8. `bun run verify:firefox-artifact` — Firefox artifact が Firefox shipping contract (manifest_v2, CSP, browser_specific_settings, required artifacts) を満たすことを検証
9. `bun run verify:firefox-source` — production source に `chrome-extension://` literal や Chrome 専用 API 呼び出しが混入していないことを検証。詳細は [Firefox extension smoke test](testing/firefox-smoke.md) を参照
10. `bun run release:e2e` — Chrome の主要ユーザーフローと Firefox の IndexedDB smoke を実行

### 配布前の E2E

`release:e2e` は次を順に実行し、どちらかが失敗すれば `release:check` と
`release:zip` を失敗させます。ブラウザや geckodriver が不足していても成功扱いにしません。

| コマンド                               | 検証する導線                                                                                                                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run e2e:release`                  | Chrome 拡張の toolbar 保存 → reload → 検索 → 開く → 既定の保存データ削除が reload 後も維持されること。既存の Backup V2 Export → データを空にする → 実 Import UI → reload 後の復元 |
| `bun run test:firefox:indexeddb-smoke` | Firefox の native IndexedDB fresh / restart / read / write / recovery / Backup V2。旧 storage metadata に依存しないこと                                                           |

Chrome は `playwright.release.config.ts` で `@release-saved-tabs` と
`@release-backup-v2` の必須テストを選びます。専用 reporter が必須タグの欠落、skip、
期待失敗、retry を検出して非ゼロ終了にします。`test.only` も禁止します。
Chrome は build を作り直し、各テスト専用 profile とローカル fixture を使います。
Firefox は既存の smoke 用 artifact コピーと一時 profile を使うため、実ユーザーデータや
配布用 manifest を書き換えません。Firefox の画面全体の E2E はこの gate の対象外です。

通常 PR CI の検査範囲と `quality:check` は維持します。全 E2E は `bun run e2e`、
Firefox startup / UI smoke は従来どおり manual workflow で確認します。
配布前の主要テストだけを再実行するときは `bun run release:e2e` を使えますが、
最終配布には `release:check` / `release:zip` 全体の成功が必要です。
Chrome 失敗時の screenshot / trace は `test-results/` に残ります。

## 独立ビルドの再現性（手動検証）

リリース前に `bun run release:reproducibility --ref <commit-sha>` で同一 SHA の
Chrome / Firefox を独立した checkout で二回ビルドできます。ZIP byte 一致と展開後の
内容一致を分けて記録します。実行条件、許容基準、SBOM / Provenance との対応は
[ビルドの再現性](testing/build-reproducibility.md)を参照してください。
初期運用は手動の観測で、既存 release gate と配布手順を維持します。

## Persistence v2 compatibility check

Issue #729 の cutover release 以降は、Store へのアップロード前に
[Persistence v2 緊急対応 runbook](runbooks/persistence-v2-emergency.md) の
compatibility policy を適用します。

- [ ] Chrome / Firefox artifact に `persistence-release.json` が含まれる
- [ ] `persistenceGeneration` と IndexedDB `databaseVersion` が意図した値である
- [ ] `minimumCompatibleAppVersion` が現在の downgrade 境界を表す
- [ ] `destructiveSchemaChange` の判断と recovery strategy を記録した
- [ ] `queryWriteContractCompatible` と `databaseDowngradeCompatible` を確認した
- [ ] migration / integrity / Backup V2 export fixtures が成功した
- [ ] rollback candidate がある場合、配布済み artifact と比較 verifier を実行した

```bash
bun run verify:persistence-release-compatibility -- \
  --deployed-dir <deployed-unpacked-extension> \
  --candidate-dir <candidate-unpacked-extension>
```

metadata が欠落・不正な artifact、pre-IDB runtime、現在の generation / DB version と
互換性のない artifact は配布しません。過去の git tag は互換性の証明ではありません。
互換性を証明できない障害対応は rollback ではなく `read-only-emergency` と
forward-fix を使用します。

## ZIP 生成

Firefox の提出用 sources ZIP は `wxt.config.ts` の `zip.includeSources`
で収録対象を明示します。`src/`、ビルド設定、`package.json`、`bun.lock`、
`.node-version`、`.bun-version` と README / privacy 文書を含めます。
隠し runtime version ファイルのため `zip.dotSources` を有効にし、
ソース内の隠しファイルと WXT 既定の test / spec / node_modules を除外します。
coverage、診断 artifact、worktree、個人用設定は提出対象に含めません。
ビルドに必要な入力を追加した際は allowlist と
`tools/scripts/wxt-build-contract.test.ts` の再現テストも更新してください。

品質確認とビルドが通ったら、ZIP を作成します。

```bash
bun run release:zip
```

このコマンドは以下の流れで実行されます：

1. `bun run release:check` — 上記の事前チェック
2. `bun run zip` — Chrome 用 ZIP 生成
3. `bun run zip:firefox` — Firefox 用 ZIP 生成
4. `bun run release:provenance` — ビルドメタデータと SBOM の生成

## Provenance / SBOM

`bun run release:zip` の完了後、`.output/` に以下のファイルが生成されます。

- `{appName}-{version}-build-metadata.json` — git SHA、runtime version、lockfile checksum、ZIP checksum などのビルド provenance
- `{appName}-{version}-sbom.cdx.json` — CycloneDX 1.6 形式の依存関係 SBOM

これらのファイルは、配布 ZIP がどのソース状態・依存関係・runtime から生成されたかを後から追跡するために使います。ZIP ファイルと同じリリース単位で保存し、Store アップロード時にはメタデータ内の checksum を参照してください。

### 採用した SBOM 形式とツール

- 形式: CycloneDX 1.6 (JSON)
- ライブラリ: `@cyclonedx/cyclonedx-library`
- データソース: `bun.lock` と `node_modules/<pkg>/package.json`

Bun エコシステムに標準の SBOM 生成ツールがないため、`bun.lock` を直接読み取って依存関係名・バージョン・integrity hash・ライセンスを SBOM 化しています。これにより、npm 用 lockfile への変換や別ツールへの依存を避け、Bun の実際の解決状態をそのまま記録します。

### メタデータに含まないもの

以下は provenance 情報に含めません。

- 絶対パスやマシン名・ユーザー名などのローカル環境情報
- 認証情報やトークン
- 開発用の内部パス

## Chrome ウェブストアへの公開

1. `bun run release:zip` で生成された `.output/*.zip` を用意します
2. `.output/tabbin-{version}-build-metadata.json` に記録された Chrome ZIP の SHA-256 を確認します
3. [Chrome ウェブストア デベロッパーダッシュボード](https://chrome.google.com/webstore/devconsole) にアクセスします
4. 該当の拡張機能を選択し、「新しいパッケージをアップロード」から ZIP をアップロードします
5. ストアの掲載情報を確認し、必要に応じて更新します
6. 審査を送信します

## Firefox アドオンへの公開

1. `bun run release:zip` で生成された `.output/*.zip` を用意します
2. `.output/tabbin-{version}-build-metadata.json` に記録された Firefox ZIP の SHA-256 を確認します
3. [Firefox Add-on Developer Hub](https://addons.mozilla.org/ja/developers/) にアクセスします
4. 該当のアドオンを選択し、新しいバージョンをアップロードします
5. 必要に応じてソースコードをアップロードします
6. 審査を送信します

## GitHub Release への添付（任意）

GitHub Release を使う場合は、以下をリリース asset として添付することを検討してください。

- Chrome ZIP
- Firefox ZIP
- `tabbin-{version}-build-metadata.json`
- `tabbin-{version}-sbom.cdx.json`

これにより、git commit / 依存関係状態 / 配布 artifact を同一の release unit で保存できます。

## 注意事項

- `release:check` は通常の開発サイクルでは使用せず、配布前の最終確認に使います
- `bun run release:zip` をパスしない ZIP は配布しないでください
- Persistence v2 compatibility checklist を満たさない ZIP は配布しないでください
- checksum は artifact の安全性そのものを保証するものではなく、配布物の同一性・追跡性を保つためのものです
