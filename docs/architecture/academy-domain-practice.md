# Academy の Domain 操作練習

Issue #1003 の教材は既存の `practice.html` と SavedTabsApp、CategoryModal、
親カテゴリ管理、子カテゴリ管理、D&D を利用する。実データの画面案内は
[読み取り専用ツアー](academy-screen-guides.md) のまま、書込操作だけを利用者が
「サンプルで練習する」から明示的に開始する。

## モデルと達成条件

ParentCategory は親、Domain の TabGroup はサイト単位の collection、子カテゴリは
その collection 内の URL 分類である。Custom のカテゴリとは別の構造である。
Domain の現行 UI には子カテゴリ間の直接ドラッグ移動がないため、キーワードで
URL タイトルを再分類する操作を学ぶ。

- 親: 作成、名称変更、ドメイン割当、別の親への移動。
- 子: 作成、名称変更、キーワード設定、URL の再分類。
- 並び替え: 親、同じ親のドメイン、同じドメインの子。ドラッグ後の確定で判定する。
  Space → 矢印 → Space と確定でも操作でき、Escape による取消は達成にしない。
- 復元: 既存の復元 use-case をメモリ上の BrowserActionPort で実行する。
  本物のブラウザタブは開かない。本番 UI の復元位置と注意点は読み取り専用でも案内する。

application の `DomainPracticeAssessmentService` は、成功した練習トランザクションの
前後 snapshot と模擬ブラウザ操作を比較する。ボタン押下や説明の閲覧だけでは進まない。
子カテゴリの改名で内部 ID が置換される実保存仕様も検証する。Custom の変更、無変更、
失敗、暫定 D&D を達成に変換しない。

## 再試行と隔離

各手順の開始時点をメモリ checkpoint として保持する。「前の手順」「この手順を
やり直す」はその状態へ復元し、進行中だった旧 session の操作は拒否する。
スキップは練習データを最初へ戻す。リセット・退出・リロードで練習データを破棄する。
既に成功した学習事実はこれらの操作で消さない。

学習進捗だけを既存の `academyProgressV1` と排他ロック経由で保存する。失敗時は
成功した操作の証跡を保持し、保存を再試行する。親・子・並び替えの達成条件を
assessmentVersion 2 へ更新するため、旧条件の進捗は勝手に初期化せず、利用者による
当該レッスンの明示リセットを必要とする。別のAcademy画面で進捗をリセットした場合も、
古いgenerationの証跡は再送せず、利用者が明示的に最初から練習をやり直す。
他のレッスンには影響しない。

実保存データ、設定、実タブには書込経路を追加しない。練習 UI の言語切替もメモリのみ。
テキスト手順は常時表示し、任意の Joyride ヒントが未表示・モーダル内・再生成中でも
操作できる。ヒントは `data-tour` を再取得し、実 Dialog 内へ portal を配置する。
reduced-motion ではスクロール時間を0にする。

## 検証

Vitest は実 use-case による状態変化、改名時の ID 変更、無変更・誤った操作、
checkpoint、保存失敗・再試行・旧条件の明示リセットを検証する。
`academy-domain-practice.extension.spec.ts` は実 UI の親子編集、keyboard/pointer D&D、
模擬復元、日英・狭幅・reduced-motion、axe、実 IndexedDB・設定・タブの前後比較を行う。
Firefox は既存の一時 XPI / WebDriver smoke から同じ実 UI を操作する。
