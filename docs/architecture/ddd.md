# TABBIN DDD アーキテクチャガイド

このドキュメントは、TABBIN の `src/contexts/<context>/` を DDD レイヤ構成で実装・運用するときの共通ルールをまとめたものです。全体方針は Issue #454、最初の一手（`saved-tabs` のスケルトン追加）は Issue #455 を参照してください。

WXT の `src/entrypoints/` は維持しつつ、UI 以外の責務を `src/contexts/` 配下の DDD レイヤへ段階移行します。`src/features/` は当面維持し、ロジックを 1 層ずつ `contexts/` 側へ移して薄くしていきます。

## 依存方向

```
entrypoints
  ↓
app/composition
  ↓
contexts/*/presentation
  ↓
contexts/*/application
  ↓
contexts/*/domain
```

`infrastructure` は `domain/repositories` の interface と `application/ports` の interface を実装します。`presentation` は `application` の use-case を呼び出し、Repository や port を直接持たないようにします。

| 依存元 ↓ / 依存先 → | domain                           | application  | infrastructure       | presentation |
| ------------------- | -------------------------------- | ------------ | -------------------- | ------------ |
| domain              | —                                | ×            | ×                    | ×            |
| application         | ○ (entity, repository interface) | —            | ×                    | ×            |
| infrastructure      | ○ (entity)                       | ○ (DTO)      | —                    | ×            |
| presentation        | × (DTO 経由)                     | ○ (use-case) | × (composition 経由) | —            |

`○` = 依存可 / `×` = 依存不可。

## `src/contexts/saved-tabs/` のレイヤ構成

```
src/contexts/saved-tabs/
  domain/
    entities/         # TabGroup / UrlRecord / ParentCategory / CustomProject
    value-objects/    # Url / DomainName / CategoryName / 各 Id / SavedAt
    repositories/     # interface のみ
    services/         # pure なドメインサービス
    errors/           # SavedTabsDomainError などのドメイン例外
  application/
    commands/         # 状態を変更するリクエスト型
    queries/          # 読み取り専用リクエスト型
    use-cases/        # 1 操作 1 ファイル
    dto/              # presentation へ返す読み取り専用モデル
    mappers/          # application 層内の DTO / snapshot 相互変換（chrome 非依存）
    ports/            # BrowserTabPort / NotificationPort / ClockPort / IdGeneratorPort / StorageChangePort / MessagingPort
  infrastructure/
    persistence/
      chrome-storage/ # Chrome*Repository 実装 / storage key / schema
      migrations/     # 既存データを壊さない migration
    browser/          # Chrome*Adapter（chrome.tabs など）
    mappers/          # storage <-> domain 変換
  presentation/
    routes/           # React Router のルート
    pages/            # ページコンポーネント
    controllers/      # use-case を呼ぶ controller hook
    components/       # 純粋な表示コンポーネント
    view-models/      # presentation 内部の整形済みモデル
```

`ai-chat` / `analytics` / `settings` / `extension-runtime` も同じ 4 層（`domain` / `application` / `infrastructure` / `presentation`）で揃えます。各 context の中身は対応 Issue で定義します。

## 各層の責務

### domain

- ビジネスルールと不変条件を置く層。`saved-tabs` の場合は `UrlRecord` の URL 形式、`TabGroup` のメンバー整合性、`ParentCategory` の優先順位、`CustomProject` の URL 参照整合性などを担います。
- React を import しません。`chrome.*` API / `localStorage` / `sessionStorage` / `toast` / router / DOM API に依存しません。
- `domain/repositories/` には **interface のみ** を置きます。実装は `infrastructure/persistence/` 側に置きます。
- 可能な限り pure function で書き、副作用を持ち込まないでください。`Date.now()` のような現在時刻依存は `application/ports/ClockPort` 経由で注入します。
- 値オブジェクト（`Url` / `DomainName` / `CategoryName` / `*Id` / `SavedAt`）はコンストラクタでバリデーションし、不正値は `domain/errors/SavedTabsDomainError` を投げます。
- 複数 entity にまたがるルール（カテゴリ自動判定、未参照 URL 掃除、開いた URL の削除ポリシーなど）は `domain/services/` に pure な関数として置きます。

### application

- ユーザー操作・background 操作を表現する層。`use-cases/` は 1 操作 1 ファイルを基本とし、副作用のオーケストレーションを担います。
- React に依存しません。`presentation` 層を参照しません。`chrome.*` API を直接呼ばず、Repository interface / port interface 経由で外部依存に触れます。
- Repository は `domain/repositories/` の interface だけを import し、`infrastructure/` 配下は import しません（依存性注入は composition 層で配線）。
- 1 つの use-case は 1 つのユーザー操作または background 操作を表し、複数の操作をまとめないでください。
- `application/ports/` には `BrowserTabPort` / `NotificationPort` / `ClockPort` / `IdGeneratorPort` / `StorageChangePort` / `MessagingPort` などの interface を置き、`chrome.tabs` や `chrome.notifications` / `chrome.storage.onChanged` / `chrome.runtime.sendMessage` への直接依存を排除します。
- `application/dto/` は presentation 層へ返す読み取り専用モデルです。domain entity を直接 UI へ渡さないでください。
- `application/commands/` と `application/queries/` はそれぞれ状態変更リクエスト・読み取りリクエストの型定義置き場です。
- `application/mappers/` は application 層内の DTO / snapshot 相互変換（`@/types/storage` 形 ↔ domain DTO / domain entity）を集約する pure な変換層です。`chrome.*` API には触れません。`SavedTabsDtosMapper` は DTO ↔ storage 形、`SavedTabsSnapshotMapper` は undo / snapshot 用に domain entity ↔ storage 形を双方向で持ち替えます（chrome.storage への I/O 自体は行わない）。一方、`infrastructure/mappers/` の `ChromeSavedTabsStorageMapper` は `chrome.storage.local` の生データ (`unknown` → Zod parse) ↔ domain entity の I/O 変換を担います。

### infrastructure

- 外部技術（`chrome.storage.local` / `chrome.tabs` / `chrome.contextMenus` / `chrome.alarms` など）への接続を閉じ込める層。
- `chrome.storage.local` への直接アクセスは `infrastructure/persistence/chrome-storage/` 配下の Repository 実装だけに限定します。`savedTabsStorageKeys.ts` で storage key を一元管理し、`savedTabsStorageSchema.ts` で永続化対象の構造を定義します。
- `chrome.tabs` / `chrome.contextMenus` / `chrome.alarms` などの browser API は `infrastructure/browser/` 配下の adapter（例: `ChromeBrowserTabAdapter`）経由で呼び出します。
- `infrastructure/mappers/` は storage の生データと domain entity / DTO の相互変換を担当します。
- 既存の保存データ形式を壊さない migration は `infrastructure/persistence/migrations/` に置きます。新規スキーマ追加時は必ず後方互換の migration を用意してください。
- infrastructure 層は domain / application に依存してよいですが、presentation には依存しません。

### presentation

- React UI / controller hook / view model を置く層。`src/features/saved-tabs/` から `use-case` 呼び出しへの薄い橋渡しになります。
- `chrome.storage.local` を直接触りません。`chrome.*` API も直接呼びません。`chrome.runtime.sendMessage` などの background 通信は use-case 経由で行います。
- UI component にドメインルールを書きません。表示整形とユーザー操作のディスパッチに専念してください。
- `controllers/` 配下の hook が `application/use-cases/` の関数を呼び、`view-models/` で整形してから component へ渡します。
- `components/` は view model を受け取り描画する純粋な component を目指し、業務ロジックは持ちません。
- `pages/` は controller hook と components を組み合わせる組み立て層です。`routes/` は React Router のルート定義のみを置きます。

## application boundary の命名規約

application 層が presentation に公開する contract は、ファイル名から種別が判断できる命名規約に従います。目的はファイル名の統一ではなく、application boundary を読み取りやすくすることです（Issue #587）。

| ディレクトリ                | 接尾辞                                   | 役割                                  |
| --------------------------- | ---------------------------------------- | ------------------------------------- |
| `application/commands/`     | `*Command.ts`                            | 状態変更リクエストの入力型            |
| `application/queries/`      | `*Query.ts`                              | 読み取りリクエストの入力型            |
| `application/dto/`          | `*Dto.ts`                                | presentation へ返す読み取り専用モデル |
| `application/use-cases/`    | `*UseCase.ts`                            | 1 操作のオーケストレーション          |
| `application/mappers/`      | `*Mapper.ts`                             | DTO / snapshot 相互変換（pure）       |
| `application/ports/`        | `*Port.ts` / `*Ports.ts` / `*Service.ts` | 外部依存の interface                  |
| `application/services/`     | `*Service.ts`                            | application 層のドメイン協調サービス  |
| `presentation/view-models/` | `*ViewModel.ts`                          | presentation 内部の整形済みモデル     |

### 配置方針

- presentation に渡すデータは DTO / ViewModel を優先し、domain entity / value object を直接渡さない（`dependency-cruiser` の `no-presentation-to-domain` で機械的に担保）。
- use-case の入力は `Command` / `Query` として表現し、use-case の出力は `Dto` として表現する。
- 小さい use-case では `*Dto.ts` に複数の関連 DTO を集約してよい。命名規約のためだけに過剰なファイル分割をしない。
- `application/ports/` の `*Ports.ts`（複数形）は複数 port を束ねる composite 型の置き場として許容する。
- `application/services/` は application 層内で domain service を組み合わせる純粋な協調サービス置き場で、`domain/services/` とは区別する。
- 命名規約は `dddLayerGuard.test.ts` で静的に検査し、違反があれば CI で検出する。

## 禁止ルール（厳守）

| 層             | 禁止事項                                                                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| domain         | React import / `chrome.*` import / `localStorage`・`sessionStorage` 直接利用 / `toast`・router・DOM API 依存 / repository interface 以外での永続化 |
| application    | React 依存 / presentation 依存 / `chrome.*` 直接呼び出し / 複数操作をまとめた use-case                                                             |
| infrastructure | presentation への依存 / domain interface を通さない直接アクセス                                                                                    |
| presentation   | `chrome.storage.local` / `chrome.*` API の直接利用 / ドメインルールの埋め込み                                                                      |

## oxlint と dependency-cruiser による機械的ガード

DDD の機械的ガードは 1 つの lint ルールへ寄せず、`dependency-cruiser` と `oxlint`
で責務を分担します。

- `dependency-cruiser` (`bun run arch:check`)
  - import graph を検査し、context 境界・layer 境界・依存方向をチェックします。
  - domain から application / infrastructure / presentation への逆流、
    context 間の禁止依存、circular dependency、unresolvable import を検出します。
  - layer / context の import 制御はここが source of truth です。`oxlint` 側へ
    `eslint/no-restricted-imports` や `import/no-cycle` を追加して代用しません。
- `oxlint` (`bun run lint`)
  - TypeScript / React / Promise / a11y / perf などのコード品質ルールを担当します。
  - `eslint/no-restricted-globals` で domain 層の `chrome` / `localStorage` /
    `sessionStorage` / `document` / `window` 利用をブロックします。
  - `eslint/no-restricted-properties` で `chrome.tabs` / `chrome.storage` /
    `chrome.contextMenus` / `chrome.alarms` / `chrome.notifications` /
    `chrome.runtime` の直叩きを layer 別にブロックします。

false positive が出たら `// oxlint-disable-next-line` のような局所回避より、
責務に応じて `dependency-cruiser` または `oxlint` の設定・wrapper・adapter
設計を見直すことを優先してください。Issue #462 がガード設定の source of truth
です。

## composition ルール

- Repository / port の実装インスタンスは `app/composition/` などの composition 層で生成し、context の外側（entrypoint や hook）から use-case へ注入します。
- composition 層は WXT の entrypoint（`src/entrypoints/background.ts` / `src/entrypoints/saved-tabs/main.tsx` など）と presentation hook の橋渡しにだけ使い、presentation 内に `new ChromeStorage...()` を書かないでください。
- テストでは Repository / port のフェイクを use-case へ注入し、`chrome.*` 呼び出しを伴わない unit test を優先します。

## 段階移行の運用ルール

1. `src/contexts/<context>/` の空構成を先に追加する（ディレクトリ + `.gitkeep`）。
2. domain 層に型・値オブジェクト・pure service を追加する。
3. repository interface と chrome-storage 実装を分離する。
4. use-case を 1 つずつ追加する。
5. presentation / controller から use-case を呼ぶ。
6. 既存 `src/features/<context>/` のロジックを段階的に薄くする。
7. 既存動作が変わっていないことをテストと手動確認で検証する。

1 つの PR につき 1 use-case または 1 層の移行に留め、UI 変更と DDD 移行を同じ PR で大きく混ぜないでください。`utils.ts` / `helpers.ts` のような曖昧なファイルを増やしてはいけません。

### Persistence Model v2 の change invalidation 境界

Persistence Model v2 の cross-context invalidation は
[`persistence-change-invalidation.md`](persistence-change-invalidation.md) を
authoritative contract とします。application 層は
`PersistenceChangePort` を定義し、application service が transaction 完了後の
revision / scope を受け取って change ID を生成し、publish を await します。
transaction abort では publish せず、commit 後の ID / publish failure は rollback
ではなく typed partial success です。infrastructure 層は同一 extension origin の
`BroadcastChannel` publisher / subscriber adapter と inbound strict validation を
担当し、composition 層が application service と consumer へ配線します。

#729 で v2 projection が authoritative になるまでは、現在の
`StorageChangePort` / `chrome.storage.onChanged` による domain UI sync を維持し、
cutover 済みとは扱いません。#729 の後に domain-key branch を削除し、Saved Tabs
は `PersistenceChangePort` と Query re-read へ移行します。settings は scope に含めず、
settings-specific な `chrome.storage.local` control-plane boundary へ分離します。

## 関連 Issue

- #454: DDD 構成へ段階移行するための全体設計と実装計画
- #455: contexts/saved-tabs の DDD ディレクトリを追加する（最初の PR）
- #462: oxlint で DDD レイヤ境界を機械的にガードする
- #380: feature UI の直接 chrome API 利用を wrapper/service に寄せる（DDD 移行と並行で進める）
