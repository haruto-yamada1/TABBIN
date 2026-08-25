# Property-based tests for storage migration / import-export

Issue #718 導入の property-based test（fast-check）の対象 invariant、
generator 配置、seed 再現手順、regression fixture 昇格基準をまとめる。

## 対象 invariant

| Invariant                                                                                              | Property test                                                                                     |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `normalize(normalize(x)) === normalize(x)`（URL identity / URL candidate / domain）                    | `src/contexts/saved-tabs/domain/services/urlNormalization.property.test.ts`                       |
| `check(snapshot) === check(snapshot)`（#712 integrity checker 決定性）                                 | `src/contexts/saved-tabs/domain/services/PersistenceIntegrityChecker.property.test.ts`            |
| corruption generator が誘発した issue code を checker が検出する                                       | 同上                                                                                              |
| `repair(repair(x)) === repair(x)`（automatic-safe repair の fixpoint）                                 | `src/contexts/saved-tabs/domain/services/PersistenceRepairPlanner.property.test.ts`               |
| `migrateLegacy(x)` の決定性（fixed clock / id generator 不要の純粋 mapper）                            | `src/contexts/saved-tabs/application/mappers/LegacyStorageToPersistenceV2Mapper.property.test.ts` |
| migration が relation を保持する（canonical / nested URL、notes、category 割当）                       | 同上                                                                                              |
| `Url.firstSavedAt <= Url.lastSavedAt`（fallback 後も成立）                                             | 同上                                                                                              |
| 同一 URL の複数 collection 所属で `Membership.addedAt` が `Url.lastSavedAt` へ不正同期されない（#732） | 同上                                                                                              |
| `import(export(v2))` が canonicalized logical snapshot を保持する（Backup V2 round trip）              | `src/features/options/lib/import-export/v2/BackupMapper.property.test.ts`                         |
| pre-IDB legacy backup 変換の決定性と Backup V2 schema 適合（#730）                                     | `src/features/options/lib/import-export/legacy/LegacyBackupAdapter.property.test.ts`              |

## Generator 配置

共有 arbitrary は `src/test/arbitraries/persistence/` に集約し、test file ごとの
重複定義を禁止する。

- `primitives.ts` — timestamp / sortOrder / domain / URL / display text
- `persistenceSnapshotArbitrary.ts` — Persistence Model v2 の valid snapshot
  generator、malformed / corrupted snapshot generator（誘発 issue code 付き）
- `legacyStorageSnapshotArbitrary.ts` — 歴史的 legacy chrome.storage shape
  （`TabGroup.urlIds` / nested `urls` / parallel mixed、`urlSubCategories`、
  `CustomProject.urlIds` / `urls` / `urlMetadata`、`ParentCategory.domains` /
  `domainNames`、`parentCategoryId`、`DomainParentCategoryMapping`）の
  well-formed generator と malformed / partially corrupted raw generator
- `backupArbitrary.ts` — canonical user settings と pre-IDB backup envelope
- `fastCheckParameters.ts` — 全 property test 共通の seed / numRuns 制御

current production type（Persistence Model v2）を legacy arbitrary の型として
再利用しない。legacy shape は `src/types/storage.ts` の legacy schema 型に
揃える。

## Seed reproduction

fast-check は failure 時に seed と path を出力する。

```text
Property failed after 134 tests
{ seed: 18927364, path: "12:3:1", endOnFailure: true }
```

CI failure と同じ case を local で再現するには:

```bash
FAST_CHECK_SEED=18927364 bunx vitest run --config vitest.ci.config.ts \
  --project=node <failing-file>
```

run 数を増やした深掘り実行（nightly / manual 相当）:

```bash
FAST_CHECK_RUNS=500 bun run test:node
```

## Regression fixture 昇格基準

property test で見つかった bug を random generator だけに任せ続けない。
以下に該当する failure は explicit regression fixture / example test へ昇格する。

- production data loss risk
- migration conflict rule bug
- timestamp corruption
- note / category relation loss
- source-of-truth cutover bug
- legacy backup compatibility bug

昇格先は対象 module の既存 example test（例:
`LegacyStorageToPersistenceV2Mapper.test.ts`）に minimal counterexample を
fixture として追加する。

## Execution strategy

- PR quality gate: 各 property `numRuns = 50`（既定）。全 property file 合計で
  1 秒未満に収まり、通常 quality gate を過度に遅くしない
- nightly / manual: `FAST_CHECK_RUNS` で numRuns を引き上げ、malformed case を
  広く探索する
- critical migration property（migration determinism、timestamp invariant、
  Backup V2 round trip）は常に PR gate に含める。「重いから migration test
  全体を nightly だけ」にはしない

## #734 cleanup 対象の識別

`src/features/options/lib/import-export/legacy/LegacyBackupAdapter.property.test.ts`
は pre-IDB legacy backup importer（2026-09-30 までの temporary compatibility
scope）を対象にする。#734 の cutoff release で legacy importer とともに削除し、
archived historical fixture と current Backup V2 test を分離する。ファイル先頭の
コメントでも同じ旨を明示している。
