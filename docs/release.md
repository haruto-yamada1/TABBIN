# リリース手順

## 事前チェック

配布前に以下のコマンドで品質とビルドを確認します。

```bash
bun run release:check
```

このコマンドは以下の流れで実行されます：

1. `bun run quality` — フォーマット、lint、テスト、重複チェックなど
2. `bun run build` — Chrome 拡張機能のビルド
3. `bun run build:firefox` — Firefox 拡張機能のビルド

## ZIP 生成

品質確認とビルドが通ったら、ZIP を作成します。

```bash
bun run release:zip
```

このコマンドは以下の流れで実行されます：

1. `bun run release:check` — 上記の事前チェック
2. `bun run zip` — Chrome 用 ZIP 生成
3. `bun run zip:firefox` — Firefox 用 ZIP 生成

## Chrome ウェブストアへの公開

1. `bun run release:zip` で生成された `.output/*.zip` を用意します
2. [Chrome ウェブストア デベロッパーダッシュボード](https://chrome.google.com/webstore/devconsole) にアクセスします
3. 該当の拡張機能を選択し、「新しいパッケージをアップロード」から ZIP をアップロードします
4. ストアの掲載情報を確認し、必要に応じて更新します
5. 審査を送信します

## Firefox アドオンへの公開

1. `bun run release:zip` で生成された `.output/*.zip` を用意します
2. [Firefox Add-on Developer Hub](https://addons.mozilla.org/ja/developers/) にアクセスします
3. 該当のアドオンを選択し、新しいバージョンをアップロードします
4. 必要に応じてソースコードをアップロードします
5. 審査を送信します

## 注意事項

- `release:check` は通常の開発サイクルでは使用せず、配布前の最終確認に使います
- `bun run release:check` をパスしない ZIP は配布しないでください
