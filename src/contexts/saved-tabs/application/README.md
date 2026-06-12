# application 層

`saved-tabs` の use-case（1 操作 1 ファイル）とそれを支える command / query / dto / port interface を置く層です。詳細ルールは `docs/architecture/ddd.md` を参照してください。

## サブディレクトリ

| ディレクトリ | 役割 |
| --- | --- |
| `commands/` | 状態を変更するリクエスト型（`OpenSavedUrlCommand` / `DeleteTabGroupCommand` など） |
| `queries/` | 読み取り専用リクエスト型（`GetSavedTabsQuery` / `SearchSavedTabsQuery` など） |
| `use-cases/` | 1 操作 1 ファイルを基本とするオーケストレーション。副作用は repository interface / port 経由 |
| `dto/` | presentation 層へ返す読み取り専用モデル（domain entity を UI に渡さない） |
| `ports/` | `BrowserTabPort` / `NotificationPort` / `ClockPort` / `IdGeneratorPort` などの interface |

## 禁止

- React 依存
- presentation 層への依存
- `chrome.*` API 直接呼び出し
- 複数操作をまとめた use-case
