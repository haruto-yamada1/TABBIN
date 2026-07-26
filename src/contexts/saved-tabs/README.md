# src/contexts/saved-tabs

`saved-tabs` 機能の DDD レイヤ構成（domain / application / infrastructure / presentation）の実装本体です。WXT の `src/entrypoints/` は維持したまま、保存タブ関連の責務をこの context 配下に集約しています。

全体方針は Issue #454、最初のスケルトン追加は Issue #455、各層の責務と禁止ルールは `docs/architecture/ddd.md` を参照してください。

## 構成

```
contexts/saved-tabs/
  domain/             # ビジネスルール・値オブジェクト・repository interface・domain service・domain DTO
  application/        # use-case / command / query / dto / mapper / port
  infrastructure/     # chrome-storage / browser adapter / mapper / composition root
  presentation/       # route / page / app / controller / hook / container / view-model / service
  testing/            # テスト用 mock factory
  dddLayerGuard.test.ts  # layer 越境の静的ガード
  README.md
```

旧 `src/features/saved-tabs/` 配下の UI / hooks / lib は DDD 移行完了に伴い撤去済みです（Issue #488）。`SavedTabsPage` / `SavedTabsRoute` などの組み立ては `presentation/` 配下にあり、`src/features/navigation/app/AppRouter.tsx`（`src/entrypoints/app/main.tsx` から lazy import される）から `SavedTabsRoute` 経由で読み込まれます。`src/entrypoints/saved-tabs/main.tsx` はレガシー URL のリダイレクト専用エントリです。

## 開発時の参照順序

1. `docs/architecture/ddd.md` で依存方向と禁止ルールを確認します。
2. 新しい use-case を追加するときは `application/use-cases/` に 1 ファイルで追加し、`SavedTabsUseCases` 型（`infrastructure/composition/createSavedTabsUseCases.ts`）へ露出します。
3. Repository / port の実装は `infrastructure/` 配下のリポジトリだけに閉じ込め、presentation 側では `use-cases` と `query` だけを呼びます。
4. 新しい UI を追加するときは `presentation/containers` または `presentation/app` で `use-case` を呼び、`presentation/components` には view model だけを渡す形にします。
5. layer 越境を検知するガードは `dddLayerGuard.test.ts` にあり、`bun run test:node` で実行できます。
