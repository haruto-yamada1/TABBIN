# 設定読込と操作の安全性

Issue #1028 は、表示用のデフォルト取得と、ユーザーデータを変更する操作の設定判定を分ける。
設定の正規保存先は引き続き `chrome.storage.local.userSettings` であり、保存 URL とカテゴリの
正規保存先・Backup V2 の形式・ブラウザ権限は変更しない。

## 読込契約

`src/lib/storage/settings.ts` の `readUserSettingsStrict` は、修復を書き込まず、次の結果を返す。

| 状態          | 条件                                     | 操作への利用                                                   |
| ------------- | ---------------------------------------- | -------------------------------------------------------------- |
| `missing`     | Storage API の読込に成功し、保存値がない | 既存デフォルトを正規の初回設定として使用できる                 |
| `available`   | 保存値が strict schema に適合する        | 旧フィールドの既定値補完・旧キー除去・正規化後の値を使用できる |
| `unavailable` | API がない、または読込が失敗した         | 操作を中止する。初回未設定として扱わない                       |
| `invalid`     | 保存値の形や既知フィールドが不正         | 操作を中止する。不正フィールドをデフォルトに置換して許可しない |

`requireUserSettings` は `available` / `missing` の値だけを返し、他の状態では値を含まない
`UserSettingsReadError` を投げる。background の `requireOperationalUserSettings` は、ブラウザの
表示言語から安全な通知を作り、同じエラーを伝播する。通知のために再読込・修復を行わない。

strict schema は既知フィールドを optional とし、正しい型の旧部分設定を受け入れる。保存された
不正な型、配列要素、enum の値は拒否する。未知キーは既存互換性のため操作設定に投影しない。

## 呼び出し箇所の設計表

以下は Issue #1028 の変更後の分類。表示用読込の結果を、削除や設定上書きの許可へ流さない。

| 呼び出し箇所                                                                                                                            | 用途・影響                                                       | 読込契約と失敗時の動作                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `lib/background/utils.ts` `filterTabsByUserSettings`                                                                                    | 固定タブ・除外 URL の保存対象判定。その後タブ閉鎖がある          | `requireOperationalUserSettings`。失敗を伝播し、元の全タブへ fallback しない                                |
| `lib/background/extension-actions.ts`                                                                                                   | アイコンの保存対象選択、同一ドメイン・ウィンドウ保存後の閉鎖判定 | `requireOperationalUserSettings`。対象選択・閉鎖に使う読込が失敗したら close しない                         |
| `lib/background/url-storage.ts`                                                                                                         | 外部ドロップ後・ドラッグからタブを開いた後の保存 URL 削除        | `requireOperationalUserSettings`。失敗時は remove しない                                                    |
| `lib/background/expired-tabs.ts`                                                                                                        | 期限切れ削除、検証用タイムスタンプ更新                           | `requireOperationalUserSettings`。失敗時は削除・時刻更新をしない                                            |
| `features/options/hooks/useSettings.ts`                                                                                                 | 設定編集フォームの読込と保存許可                                 | `readUserSettingsStrict`。失敗時は表示用初期値を保持して全保存経路を停止。再読込と明示復旧を提供            |
| `features/options/hooks/useAutoDeletePeriod.ts`                                                                                         | 期間の保存と background への期限・時刻更新依頼                   | 最新値を `requireUserSettings` で読み、期間だけ変更して `saveUserSettings`。失敗時は保存・更新依頼をしない  |
| `features/i18n/context/I18nProvider.tsx` `setLanguageSetting`                                                                           | 言語変更による設定全体の保存                                     | `requireUserSettings` → `saveUserSettings`。失敗時は保存と表示言語変更をしない                              |
| `lib/storage/settings.ts` `saveUserSettings`                                                                                            | 全設定の明示保存。色変更など既存 writer も通る                   | 現在値を `requireUserSettings` で事前検証。読込不能・不正なら書き込まない                                   |
| `contexts/saved-tabs/infrastructure/persistence/chrome-storage/ChromeUserSettingsRepository.ts`                                         | Saved Tabs の操作設定取得、DDD 経由の設定保存                    | `findAll` は strict schema で検証し失敗を伝播。`save` も事前に `findAll` を実行する                         |
| `features/analytics/routes/AnalyticsRoute.tsx`                                                                                          | 単体・一括削除の確認設定と実削除                                 | 確認と削除の直前に `requireUserSettings`。表示用 fallback で削除確認を省略しない                            |
| `app/composition/optionsBackupV2Export.ts`                                                                                              | バックアップへ出力する設定値                                     | `requireUserSettings`。障害時のデフォルトを正常なバックアップとして出力しない                               |
| `app/composition/optionsBackupRecovery.ts`                                                                                              | import・事前復旧スナップショット・設定の復元と検証               | `requireUserSettings` を既存 use case に注入。障害時のデフォルトを復旧用設定として保存しない                |
| `features/i18n/context/I18nProvider.tsx` 初期読込                                                                                       | 表示言語だけを決める                                             | 表示用 `getUserSettings` の fallback を維持。設定保存の根拠にはしない                                       |
| `lib/background/i18n.ts`                                                                                                                | 通常通知の表示言語を決める                                       | 表示用 `getUserSettings` の fallback を維持。設定読込失敗の通知はこの経路を使わない                         |
| `features/analytics/lib/loadAnalyticsRecords.ts`                                                                                        | 分析画面の表示対象を絞る                                         | 表示用 `getUserSettings` の fallback を維持。削除時は上記の別途 strict read が必要                          |
| `features/ai-chat/hooks/useOllamaModelSettings.ts`、`useSavedTabsChatController.ts`、`components/savedTabsChat/useChatPromptManager.ts` | AIモデル・選択プロンプト・プロンプト一覧の保存                   | `requireUserSettings` の最新値へ所有するフィールドだけを merge。表示用 fallback 全体を保存しない            |
| `lib/background/ai-chat.ts`、`features/ai-chat/components/savedTabsChat/storage.ts`                                                     | AI 画面・リクエストのモデルやプロンプト選択                      | 非破壊的な既存 `getUserSettings` fallback を維持。この値から保存 URL 削除・タブ閉鎖・設定永続化を許可しない |

Saved Tabs の repository は単なる表示専用ではない。取得した `removeTabAfterOpen` や削除確認の
設定が操作へ渡るため、repository 自体を strict にする。Practice の in-memory repository や
テスト fixture は実データに書き込む境界ではないため、Chrome Storage の読込障害を導入しない。

プロンプト編集は開始時点の一覧を保持し、保存時の最新一覧と一致しなければ書き込まず、実際の保存済み一覧を再表示する。表示fallbackや編集中の外部更新によって未表示のプリセットを失わない。

## 修復と復旧

表示用の `getUserSettings` は、既存の tolerant parser による表示 fallback を維持する。
保存値が strict schema で正しい場合だけ、旧キー除去や除外パターンの既存正規化を修復として
書き戻せる。修復書込が失敗しても、すでに読めた明示設定をデフォルトに置換しない。
strict read は修復書込をしないため、修復の失敗が操作の許可へ変換されることはない。

Options では `unavailable` / `invalid` の間は編集 UI を復旧案内に置き換える。再読込は書込を
伴わない。`invalid` のときだけ、ユーザーが「設定を初期値に戻す」を選択できる。
`resetInvalidUserSettings` は再読込が成功し、なお `invalid` であると確認した場合だけ設定を
デフォルトに置き換える。API 不在・読込失敗ならリセットしない。保存 URL・カテゴリは触らない。
設定値・プロンプト・元の Storage エラー本文をエラー通知や設定読込ログへ出さない。

読込と書込は Chrome Storage の別操作であり、この変更は transaction や cross-context CAS を
導入しない。既存の並行編集モデルを維持し、障害時 fallback を操作に流さない境界を追加する。
保存対象と閉鎖判定の単一 snapshot 化、Alarm 頻度、保存のみモード、自動削除の猶予・復元は
それぞれ #1031、#1010、#1011、#1013 の別スコープとして残す。
