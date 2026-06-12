# infrastructure 層

`saved-tabs` の外部技術依存（`chrome.storage.local` / `chrome.tabs` など）を閉じ込める層です。詳細ルールは `docs/architecture/ddd.md` を参照してください。

## サブディレクトリ

| ディレクトリ                  | 役割                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `persistence/chrome-storage/` | `Chrome*Repository` 実装 / `savedTabsStorageKeys.ts` / `savedTabsStorageSchema.ts` |
| `persistence/migrations/`     | 既存保存データを壊さない migration（`migrateLegacySavedTabs.ts` など）             |
| `browser/`                    | `chrome.tabs` / `chrome.contextMenus` / `chrome.alarms` などの adapter             |
| `mappers/`                    | storage の生データ ↔ domain entity / DTO の相互変換                                |

## 禁止

- presentation 層への依存
- domain interface を通さない直接アクセス
