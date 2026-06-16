# presentation 層

`saved-tabs` の React UI / controller hook / view model / 組み立て層を置く層です。詳細ルールは `docs/architecture/ddd.md` を参照してください。

## サブディレクトリ

| ディレクトリ    | 役割                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------- |
| `routes/`       | React Router のルート定義                                                                                     |
| `pages/`        | ページコンポーネント（composition root。controller / container / providers を組み合わせる）                   |
| `app/`          | `SavedTabsApp` 本体（DOM 全体）と `savedTabsApp.helpers` / `savedTabsProfiler` などの組み立て補助             |
| `containers/`   | `DomainModeContainer` / `CustomModeContainer` などの view モード別組み立て層                                  |
| `controllers/`  | use-case を呼ぶ controller hook（`useSavedTabsController` / `useDomainModeController` / `useCustomModeController`）と `SavedTabsUseCasesContext` |
| `components/`   | view model を受け取り描画する純粋な component（`CategoryGroup` / `CategoryModal` / `SortableUrlItem` など）と `category-group` / `category-modal` / `domain-card` / `project-card` / `keyword-modal` / `shared` 配下のサブディレクトリ |
| `hooks/`        | UI 単位の hook（`useCategoryManagement` / `useTabData` / `useCategoryGroupState` / `useProjectManagement` / DnD / ソートなど）|
| `view-models/`  | presentation 内部の整形済みモデル（`SavedTabsViewModel` / `DomainModeViewModel` / `CustomModeViewModel` / `TabGroupViewModel` / `CustomProjectViewModel`）|
| `services/`     | `StorageChangePort.subscribe` を受けて React state へ反映する `modeSyncService` / `viewModeNavigationService` / undo 通知 service |
| `lib/`          | presentation 層内の pure 関数（`categorized-display` / `display-tab-group` / `scroll-controls` など）       |
| `types/`        | presentation 層内のローカル型（`mode` / component 固有の型）                                                   |

## 禁止

- `chrome.storage.local` / `chrome.*` API の直接利用
- ドメインルールの埋め込み（entity のバリデーションや不変条件は domain 層に置く）
- repository / port 実装の直接 import（composition root 以外では `application/use-cases` または query を介する）
