# infrastructure 層

`saved-tabs` の外部技術依存（`chrome.storage.local` / `chrome.tabs` など）を閉じ込める層です。詳細ルールは `docs/architecture/ddd.md` を参照してください。

## サブディレクトリ

| サブディレクトリ              | 役割                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `persistence/chrome-storage/` | `Chrome*Repository` 実装 / `savedTabsStorageKeys.ts` / `savedTabsStorageSchema.ts` / `ChromeStorageLocalPort` |
| `persistence/migrations/`     | 既存保存データを壊さない migration（`migrateLegacySavedTabs.ts` など）                                        |
| `browser/`                    | `chrome.tabs` / `chrome.contextMenus` / `chrome.alarms` などの adapter                                        |
| `mappers/`                    | storage の生データ ↔ domain entity / DTO の相互変換                                                           |

## 禁止

- presentation 層への依存
- domain interface を通さない直接アクセス
- `chrome.*` 永続化 API の domain 層への漏洩

## repository パターン

- domain 層は `domain/repositories/` の interface のみを参照する。
- infrastructure 層は `infrastructure/persistence/chrome-storage/` 配下に
  `createChromeXxxRepository()` ファクトリを公開し、composition 層から
  use-case へ注入する。
- `ChromeStorageLocalPort` 経由で `chrome.storage.local` を抽象化し、テスト時は
  in-memory モックを注入する。
- 旧 `src/lib/storage/*` の `chrome.storage.local` 直叩きは並行稼働させる。
  段階的にこの repository へ移行する（use-case 化と併せて別 issue で進める）。
