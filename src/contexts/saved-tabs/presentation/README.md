# presentation 層

`saved-tabs` の React UI / controller hook / view model を置く層です。詳細ルールは `docs/architecture/ddd.md` を参照してください。

## サブディレクトリ

| ディレクトリ | 役割 |
| --- | --- |
| `routes/` | React Router のルート定義 |
| `pages/` | ページコンポーネント（controller hook + components の組み立て） |
| `controllers/` | use-case を呼ぶ controller hook（`useSavedTabsController` など） |
| `components/` | view model を受け取り描画する純粋な component（`TabGroupCard` / `TabGroupList` など） |
| `view-models/` | presentation 内部の整形済みモデル |

## 禁止

- `chrome.storage.local` / `chrome.*` API の直接利用
- ドメインルールの埋め込み（entity のバリデーションや不変条件は domain 層に置く）
