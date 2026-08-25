# IndexedDB 子カテゴリキーワード再分類 設計

## 背景

子カテゴリのキーワード保存後、設定自体は永続化されるが、既存タブの子カテゴリ割当が更新されない。

production の完全cutover後は `SetCategoryKeywordsUseCase` がIndexedDB側の `setCategoryKeywordsPort` を呼ぶ。この実装はcollection categoryの名前とキーワードを更新するだけで、collection membershipの `categoryId` を再計算していない。一方、旧storage経路は保存後に既存URLを再分類する。

## 要件

- キーワード保存と既存membershipの再分類を同一IndexedDB session／Unit of Workで行う。
- URLタイトルを大文字小文字を無視してキーワード照合する。
- 複数カテゴリに一致した場合は、collection categoryの表示順で最初に一致したカテゴリを採用する。
- 一致したmembershipだけ `categoryId` と `updatedAt` を更新する。
- 一致しないmembershipの既存割当、`notes`、`sortOrder`、`addedAt`、provenanceを維持する。
- 対象collection外のmembershipとURLを変更しない。
- JSON-safe／exact optional契約を維持し、`categoryId: undefined` を生成しない。

## 設計

`NativeSavedTabsPersistenceAdapters` の `setCategoryKeywordsPort` を修正する。

1. 現行どおり対象domain collectionとcategory一覧を取得する。
2. `saveDomainCategories`でカテゴリ名とキーワードを保存する。既存カテゴリIDは維持し、新規カテゴリだけIDを生成する。
3. 保存後のcategory順を読み、URL IDからURLレコードを参照する。
4. 対象collectionの各membershipについて、URLタイトルに最初に一致するcategoryを選ぶ。
5. 一致した場合だけmembershipをimmutableに更新し、`categoryId`と`updatedAt`を設定する。一致しない場合は元のmembershipを返す。

分類処理はadapter内の小さなpure helperへ分離する。UIから二度目の保存を呼ばず、legacy storageとのdual writeやfallbackも追加しない。

## エラー処理と整合性

変更は既存の `IndexedDbSavedTabsSessionService.run` 内のmutable stateに適用され、Unit of Workのcommitで一括永続化される。commit失敗時はキーワードだけ、またはmembershipだけが残る部分成功を許容しない。

対象collectionまたはURLレコードが見つからない場合は、そのmembershipを変更しない。空キーワードは一致扱いにしない。

## テスト

IndexedDB runtimeに近いintegration testを先に追加し、現行コードで失敗することを確認する。

- 未分類membershipのURLタイトルが新しいキーワードに一致すると、保存・再読込後に該当category IDへ移動する。
- 複数categoryに一致すると、category順で最初のものが選ばれる。
- 一致しないmembershipの既存category IDと補助フィールドは維持される。
- 対象collection外のmembershipは変更されない。

その後、focused test、全Node/DOM test、`quality:check`、coverageを実行する。

## 非対象

- URL文字列や本文を照合対象へ追加すること。
- キーワード削除時に一致しなくなった既存割当を解除すること。
- legacy storage側の分類実装を共通化する大規模リファクタリング。
