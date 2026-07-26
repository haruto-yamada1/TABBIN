# domain 層

`saved-tabs` のドメインモデル（entity / value object / repository interface / pure service / domain error）を置く層です。詳細ルールは `docs/architecture/ddd.md` を参照してください。

## サブディレクトリ

| ディレクトリ     | 役割                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| `entities/`      | `TabGroup` / `UrlRecord` / `ParentCategory` / `CustomProject` の entity 定義                       |
| `value-objects/` | `Url` / `DomainName` / `CategoryName` / `*Id` / `SavedAt` などの不変値型                           |
| `repositories/`  | repository の **interface のみ**（実装は `infrastructure/persistence/chrome-storage/`）            |
| `services/`      | 複数 entity にまたがる pure なドメインサービス（カテゴリ判定、URL 参照チェック、削除ポリシーなど） |
| `errors/`        | `SavedTabsDomainError` などのドメイン例外                                                          |

## 禁止

- React import
- `chrome.*` API import
- `localStorage` / `sessionStorage` 直接利用
- `toast` / router / DOM API 依存
- 副作用（`Date.now()` などの現在時刻依存は `application/ports/ClockPort` 経由で注入）
- `repositories/` から `infrastructure/` 配下を import する（interface のみで完結させる）
