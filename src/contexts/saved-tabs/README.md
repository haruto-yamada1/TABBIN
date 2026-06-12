# src/contexts/saved-tabs

`saved-tabs` 機能の DDD レイヤ構成（domain / application / infrastructure / presentation）のスケルトンです。WXT の `src/entrypoints/` は維持したまま、保存タブ関連の責務を段階的にこの配下へ移します。

全体方針は Issue #454、最初の追加 PR は Issue #455、各層の責務と禁止ルールは `docs/architecture/ddd.md` を参照してください。

## 構成

```
contexts/saved-tabs/
  domain/             # ビジネスルール・値オブジェクト・repository interface
  application/        # use-case / command / query / dto / port
  infrastructure/     # chrome-storage / browser adapter / mapper / migration
  presentation/       # route / page / controller hook / component / view-model
```

当面はスケルトンのみです。`features/saved-tabs` の既存ロジックは変更せず、後続 Issue（#456 以降）で 1 層ずつ / 1 use-case ずつ移します。実装時には `docs/architecture/ddd.md` を起点に依存方向と禁止ルールを確認してください。
