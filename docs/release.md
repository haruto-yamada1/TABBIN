# リリース手順

## バージョン更新

拡張機能のバージョンは `package.json` の `version` を authoritative source とする。
リリース前に `package.json` の `version` を更新するだけでよく、`wxt.config.ts` やバックアップコードに version literal を重複定義する必要はない。

## 事前チェック

配布前に以下のコマンドで品質とビルドを確認します。

```bash
bun run release:check
```

このコマンドは以下の流れで実行されます：

1. `bun run quality` — フォーマット、lint、テスト、重複チェックなど
2. `bun run build` — Chrome 拡張機能のビルド
3. `bun run build:firefox` — Firefox 拡張機能のビルド
4. `bun run verify:app-version` — 生成された manifest version が package.json と一致することを確認

## ZIP 生成

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
- checksum は artifact の安全性そのものを保証するものではなく、配布物の同一性・追跡性を保つためのものです
