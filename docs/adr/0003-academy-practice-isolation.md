# ADR 0003: 書き込み練習だけを本番データから隔離する

- 状態: 採用（Issue #1001 の更新方針を反映）
- 日付: 2026-10-30
- 関連: #1001、#996、#997、#1002、#1003

## 実画面の案内と任意の書き込み練習

Domain/Custom の見方、保存 URL の表示位置、検索欄などの画面案内は、普段の
TABBIN UI とユーザーの現在の保存データを使う。ダミーの一覧画面を作らず、
練習用 repository や #997 のデモデータを前提にしない。データが空なら空状態と
テキスト・動画を使い、本番の一覧へサンプルを自動追加しない。
Joyride による read-only オーバーレイと案内の進捗は #1002 が担当する。
今回の通常画面リンク自体をツアーの完了や操作習得とはみなさない。

#1001 はカテゴリ作成・変更、URL/ドメイン移動、削除、復元など、書き込みを伴う
練習の隔離だけを担当する。ユーザーが「サンプルで練習する」を明示選択した時だけ
メモリ内の composition を起動する。画面説明だけのレッスン、native ツールバーの
保存操作、未知のレッスンは、練習 URL に直接アクセスしても adapter を作らない。

## 本物の React UI の再利用

練習も `SavedTabsApp`、`CategoryModal`、CategoryGroup、DomainCard、controller、
application use-case、`createNativeSavedTabsPersistenceAdapters` と domain の
不変条件を再利用する。画面や業務ルールを別の偽 UI として実装しない。
composition root の `createPracticeComposition` が repository、設定、検索履歴、
並び順、ブラウザ操作を独立したメモリ内の依存へ差し替える。

`practice.html` はこの同じ UI を安全に起動するための entrypoint である。
通常の `app.html` が持つ DB bootstrap、設定修復、native title relay、AI 会話、
本番復旧 export は起動しない。言語設定もメモリ内に限定する。
常時表示するラベルと説明で通常画面と区別する。

ブラウザ port は復元要求をメモリに記録し、「模擬操作」と明示する。
URL 項目に実リンク・native draggable URI を出さず、実タブへ fallback しない。
ツールバー保存や実タブ終了は動画・テキストの対象とし、汎用の模擬保存ボタンや
ブラウザ全体のシミュレーターは提供しない。

## 最小データとセッション

練習対象に必要な `.test` 3 hostname・6 URL・親2個・子カテゴリ複数・Custom1個を
固定 seed とし、既存 integrity checker で検証する。空状態も利用できる。
#997 は任意の素材元であり、30 site/40 tab や録画サーバを本番へ含めない。

更新は既存 use-case を一時コピーで直列に実行し、成功結果だけを採用する。
reset、終了、アンマウント、リロードで破棄し、旧セッションの遅延更新を拒否する。
lesson/step 単位の reset API は Promise を返し、同じ composition の保存データ・
検索・並び順の購読者への通知完了を await できる。破棄や再 reset によるキャンセル、
通知の失敗は呼び出し元に返し、握りつぶさない。Error Boundary、未対応レッスン、
操作失敗でも本番の書き込みへ切り替えず、説明へ戻る。

練習データを通常の保存タブへ移行せず、途中保存もしない。追加権限、外部送信、
新しい本番スキーマは不要。学習の記録は #996 の契約を維持し、入室・reset・退出を
達成扱いにしない。成功判定と具体的な実習教材は #1002/#1003 が担当する。

## 検証と rollback

Vitest は書き込み対象への限定、read-only/未知の direct URL で adapter 未生成、
native API 拒否、作成・移動・削除・模擬復元・Undo、失敗 rollback、遅延更新を検証。
Playwright は通常画面が実データ/空状態を表示して練習コードやサンプルを使わないこと、
明示選択後の練習で本番 IndexedDB・設定・実タブの前後 snapshot が一致することを確認する。

rollback は練習導線と専用 entrypoint を戻すだけで、本番 DB の移行は不要。
