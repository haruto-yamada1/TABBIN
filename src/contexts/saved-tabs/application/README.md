# application 層

`saved-tabs` の use-case（1 操作 1 ファイル）とそれを支える command / query / dto / port interface を置く層です。詳細ルールは `docs/architecture/ddd.md` を参照してください。

## サブディレクトリ

| ディレクトリ | 役割                                                                                                                          |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `commands/`  | 状態を変更するリクエスト型（`OpenSavedUrlCommand` / `DeleteTabGroupCommand` など）                                            |
| `queries/`   | 読み取り専用リクエスト型（`GetSavedTabsQuery` / `SearchSavedTabsQuery` / `GetSavedTabsPageDataQuery` など）                   |
| `use-cases/` | 1 操作 1 ファイルを基本とするオーケストレーション。副作用は repository interface / port 経由                                  |
| `dto/`       | presentation 層へ返す読み取り専用モデル（domain entity を UI に渡さない）                                                     |
| `mappers/`   | application 層内の DTO / snapshot 相互変換（`SavedTabsDtosMapper` / `SavedTabsSnapshotMapper`）                               |
| `ports/`     | `BrowserTabPort` / `NotificationPort` / `StorageChangePort` / `MessagingPort` などの interface（chrome / toast 副作用の抽象） |

`mappers/` は `@/types/storage` 形 ↔ domain DTO / snapshot の pure 変換専用で、`chrome.*` API には触れません。storage ↔ domain entity 変換は `infrastructure/mappers/` の責務です。

## 禁止

- React 依存
- presentation 層への依存
- `chrome.*` API 直接呼び出し
- 複数操作をまとめた use-case
