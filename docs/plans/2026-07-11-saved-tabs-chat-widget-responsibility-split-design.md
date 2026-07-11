# SavedTabsChatWidget 責務分割設計

## 目的

`SavedTabsChatWidget.tsx` に集中している状態管理、外部 I/O、画面表示を責務境界で分離し、
既存挙動を変えずに AI チャット機能を拡張できる構造へ整理する。

## 方針

薄いファイルへ既存処理を移すだけではなく、外部 I/O とライフサイクルを専用 hook に
閉じ込める。`SavedTabsChatWidget` は controller の view model と actions を表示 component
へ接続する composition component とする。

状態 machine への全面的な置き換えは行わない。streaming、runtime port、conversation
generation の既存の競合制御を維持しながら責務だけを移動し、挙動変更によるデグレを
避ける。

## 責務境界

### `useSavedTabsChatController`

- widget props と i18n を受け取り、画面に必要な view model と actions を返す
- settings と Chrome storage の同期を管理する
- message state、streaming、runtime port、conversation generation を管理する
- system prompt、会話 reset、履歴選択を調停する
- resize、clipboard、Ollama model settings の専用 hook を組み合わせる
- JSX を返さず、表示 component の DOM 構造を知らない

### `useChatSidebarResize`

- sidebar width の初期復元、clamp、永続化を管理する
- pointer move / up listener の登録と解除を管理する
- resize 中の `document.body.style.cssText` を退避し、終了時と unmount 時に復元する
- page mode では resize I/O を発生させない

### `useConversationClipboard`

- Clipboard API の capability 判定を行う
- 会話コピー文字列を書き込み、成功・失敗 toast を表示する
- copied icon の timeout と unmount cleanup を管理する
- controller と表示 component に browser API の詳細を漏らさない

### `useOllamaModelSettings`

- Ollama model 一覧の取得、選択モデルの保存を管理する
- loading、saving、error、platform state を管理する
- 保存成功時に controller が settings と conversation を更新できる action を返す

### 表示 component

- `SavedTabsChatHeader` は履歴、system prompt、copy、new conversation、close の表示を担う
- `SavedTabsChatComposer` は入力、attachment、model selector、submit の表示を担う
- `SavedTabsChatPanel` は header、conversation、notice、composer と page / floating shell を構成する
- storage、runtime port、settings 保存を直接呼ばず、値と callback のみを props で受け取る
- 既存の DOM 構造、test id、accessible name、page / floating の見た目を維持する

### `SavedTabsChatWidget`

- `useSavedTabsChatController` を呼ぶ
- floating launcher の表示条件を判断する
- controller の view model と actions を `SavedTabsChatPanel` へ渡す
- business logic、browser I/O、streaming details を持たない

## データフロー

1. Widget props と storage settings を controller が正規化する。
2. controller は専用 hook の state と actions を統合する。
3. Panel / Header / Composer は view model を描画し、ユーザー操作を action として返す。
4. controller が message、settings、streaming lifecycle を更新する。
5. `onMessagesChange` など外部 callback は既存タイミングを維持して通知する。

## 互換性とエラー処理

- streaming 中の port disconnect と generation token の競合制御を変更しない
- conversation 切り替え時の外部 message 同期と通知抑制を維持する
- Clipboard API 不在、Ollama fetch / save 失敗、storage 読み込み失敗の表示を維持する
- resize cleanup は pointer up、close、unmount のすべてで同じ後処理を通す
- `useCallback` / `useMemo` の依存関係は移動後の所有 state に合わせて再検証する

## テスト戦略

- 既存 `SavedTabsChatWidget.test.tsx` を end-to-end に近い component contract として維持する
- resize hook では復元、drag、永続化、body style 復元、unmount cleanup を検証する
- clipboard hook では成功、API 不在、write 失敗、timeout cleanup を検証する
- Ollama hook では一覧取得、保存、loading / saving、platform 別 error を検証する
- controller では conversation 切り替え、streaming notification、disconnect 競合を重点検証する
- component 分割後も accessible name、test id、page / floating mode の統合テストを通す
- 最終確認として full test、coverage 100%、compile、lint、React Doctor、quality を実行する

## Rollback 条件

次のいずれかが起きた場合は、該当責務の移動を小さい単位へ戻して原因を特定する。

- 既存 widget test の notification 回数または streaming lifecycle が変化する
- page mode と floating mode の DOM または操作差分が失われる
- hook 抽出のためだけの wrapper や browser API の二重抽象が必要になる
- view component が storage、runtime port、settings 保存を直接参照する
