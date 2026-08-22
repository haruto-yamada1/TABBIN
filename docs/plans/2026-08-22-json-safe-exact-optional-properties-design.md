# JSON-safe optional properties design

## Goal

Persistence V2 に書き込まれる値が、runtime と TypeScript の両方で
「optional property が存在しない状態」と「値が `undefined` の状態」を区別し、
JSON-safe 境界で同種の保存失敗を再発させないようにする。

## Confirmed causes

- `createTabGroup` は親カテゴリなしの通常入力では `groupId` を省略するが、
  入力自身が `{ groupId: undefined }` を持つ場合は先頭の object spread から
  再混入する。
- `createSavedAt` は `-0` を受理する。一方 `isJsonValue` は JSON round-trip で
  `0` に変わる `-0` を拒否するため、保存時に不整合になる。
- `TabGroup` / `CustomProject` の membership と `UrlRecord` の
  `favIconUrl` にも、optional field を値 `undefined` として保持できる生成経路が
  ある。
- `exactOptionalPropertyTypes` は未設定であり、明示的 `undefined` を optional
  property へ代入しても compile error にならない。

## Decision

### Runtime boundary (B)

Domain factory が所有する既知の optional field だけを正規化する。

- `TabGroup.collection.groupId`
- `TabGroup.memberships[].addedAtProvenance/categoryId/notes`
- `CustomProject.collection.groupId`
- `CustomProject.memberships[].addedAtProvenance/categoryId/notes`
- `UrlRecord.favIconUrl`

未設定値は property 自体を生成しない。汎用の recursive sanitizer や
`JSON.stringify` round-trip は追加しない。未知の値、非有限数、疎配列、特殊な
prototype などは既存の `IndexedDbPersistenceUnitOfWork` の fail-closed 検証に
引き続き拒否させる。

`SavedAt` は `Object.is(value, -0)` を不正値条件へ追加する。`0` は引き続き有効。

### Compile-time boundary (C)

`tsconfig.json` で `exactOptionalPropertyTypes: true` を有効にする。

各 compile error は次の意味に基づいて修正する。

1. property が未設定なら存在すべきでない場合は conditional spread で省略する。
2. property が常に存在し、値として `undefined` を許す state なら
   `property: T | undefined` とする。
3. property の存在自体が optional で、呼び出し側が明示的 `undefined` を渡す
   外部契約なら `property?: T | undefined` とする。
4. third-party config には `undefined` を渡さず、設定値がある場合だけ property を
   構築する。
5. type assertion や `as unknown as` で error を隠さない。

一時的に compiler error を抑制する設定、対象外 glob、広い lint disable は
追加しない。

## Commit structure

1. `JSON安全なoptional値の生成境界を強化`
   - runtime factory、value object、回帰テスト、設計・実装計画
2. `optionalプロパティ型を厳密化`
   - `exactOptionalPropertyTypes` 有効化と全 compile error の意味的修正

## Data flow

```text
external/storage/view model
  -> domain factory canonicalizes known optional fields (B)
  -> application/infrastructure mutation state
  -> PersistenceV2WritePlan
  -> fail-closed isJsonValue validation (unchanged)
  -> IndexedDB transaction

TypeScript object construction
  -> exactOptionalPropertyTypes (C)
  -> explicit undefined assignment rejected at compile time
```

## Testing

- B は failing unit test を先に追加し、明示的 `undefined` の property 不在と
  `-0` の拒否を検証する。
- B commit 前に近接 node tests、全 test、`quality:check`、`test:coverage` を行う。
- C は flag 有効化直後の compile failure を基準に、error count をゼロまで減らす。
- C commit 前に `compile`、全 test、`quality:check`、`test:coverage` を行う。
- 最後に fresh-context Evaluator、harness audit / validate を行う。

## Non-goals

- IndexedDB の JSON-safe 検証を緩めない。
- Persistence warning-only record や projection 外 record を削除しない。
- optional field と無関係な refactor、UI変更、API仕様変更を行わない。
