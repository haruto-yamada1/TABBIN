# ADR 0003: Academy の練習環境を本番 API から分離する

- 状態: 採用
- 日付: 2026-10-30
- 関連: #1001、#996、#997、#1002、#1003

## 判断

Academy の「実際に試す」は専用 `practice.html` へ同じタブで移動する。
通常の `app.html` は IndexedDB bootstrap、native title relay、設定の読み込みと
修復、AI 会話など本番の副作用を持つため、練習には起動しない。

練習は composition root の `createPracticeComposition` が作る独立したメモリ内
セッションだけを使う。`SavedTabsApp`、controller、application use case、
`createNativeSavedTabsPersistenceAdapters` の canonical state adapter と domain
不変条件を再利用する。保存スキーマやカテゴリ編集・削除・移動のロジックは複製しない。
後者は IndexedDB という名前の state 型を使うが、実行時の DB/API 依存を持たない。

ブラウザ port は操作要求をメモリに記録する。保存・終了・復元は常時「模擬操作」と
明示する。URL 項目は実リンクや native draggable URI を出さず、注入した操作のみを
呼ぶ。実際のタブを開く fallback は練習では使わない。AI、設定、復旧 export と
本番 navigation shell は mount しない。言語設定も独立したメモリ内 provider を使う。

## セッションと障害

更新は既存 use case を実行する一時コピーを直列化し、成功した結果だけ採用する。
reset、終了、アンマウント、リロードで練習状態を破棄し、遅延した旧セッションの更新を
拒否する。lesson/step 単位の reset API と空/保存済み fixture を提供する。
Error Boundary と操作失敗は練習画面に留まり、本番 composition へ切り替えない。
実習状態の途中保存は行わない。追加権限、外部送信、永続化 namespace は増やさない。

学習進捗は #996 の契約が唯一の永続化窓口。今回の自由練習への入室・reset・退出は
操作達成とはみなさず、進捗を書き換えない。#1002 の成功判定で必要な事実だけを記録する。

## 再利用のギャップ

- 保存タブ一覧、Domain/Custom、親/子カテゴリ、並べ替え、移動、削除、復元の UI と
  use case は再利用する。ブラウザの保存アイコン・タブ終了自体は native UI なので、
  練習ボタンが固定の架空 snapshot を投入し、終了要求を模擬記録する。
- #997 の共通 fixture は実装時点で未提供。決定的な `.test` 3 hostname、6 URL、
  親カテゴリ2個、各 collection の子カテゴリ2個、Custom collection を seed する。
  既存 integrity checker で検証し、後続の共通 fixture は同じ snapshot 入力へ置換できる。
  30 site/40 tab の録画環境や test server を本番 bundle に含めない。
- Joyride、レッスンごとの達成判定・自動 step 遷移、教材は #1002/#1003 で扱う。
  今回は安全に自由練習できる composition と reset API を提供する。

## 検証と rollback

単体契約テストで native globals を拒否し、作成・移動・削除・復元・Undo、同時操作、
失敗 rollback、reset/終了時の遅延操作を検証する。実ブラウザ E2E は練習 entrypoint
からの IndexedDB・storage 書込・tab API を拒否し、本番 IndexedDB snapshot、設定、
実 tab ID が操作・reset・reload・退出後も一致することを確認する。

rollback は Academy の練習導線と専用 entrypoint を戻すだけでよい。本番 DB の変更や
migration はなく、練習データはページ終了で破棄される。
