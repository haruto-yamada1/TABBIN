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

`mappers/` は `@/types/storage` 形 ↔ domain DTO / domain entity の pure な構造変換専用で、`chrome.*` API には触れません。`SavedTabsDtosMapper` は DTO ↔ storage 形、`SavedTabsSnapshotMapper` は undo / snapshot 用に domain entity ↔ storage 形を双方向で持ち替えます（chrome.storage への I/O 自体は行わず、純関数として use-case / command の入出力整形に専念）。一方、`infrastructure/mappers/ChromeSavedTabsStorageMapper` は `chrome.storage.local` の生データ (`unknown` → Zod parse) ↔ domain entity の I/O 変換を担い、Zod 検証と entity 化失敗時の `null` フォールバックを持ちます。

## 禁止

- React 依存
- presentation 層への依存
- `chrome.*` API 直接呼び出し
- 複数操作をまとめた use-case
