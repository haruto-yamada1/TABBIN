# Academy ネイティブ録画 PoC

Issue [#998](https://github.com/haruto-yamada1/TABBIN/issues/998) の撮影用ツールです。
公開ストアからの導入、拡張機能メニューでの固定、本物のアイコンからの保存を、
毎回新しい Chromium 系プロファイルで再現します。通常のプロファイルや保存データへ
接続する引数はありません。原本、ログ、失敗画像は `recordings/academy/poc-*` に
保持し、commit や本番 ZIP に含めません。

`../record.ts` は保存済み fixture のページ動画を撮る既存ツールです。この PoC は
保存データが空であることを確認してから、#997 の manifest の 3 hostname・6 URL を
実タブとして開きます。40 タブや外部サイト、DNS 設定、ローカルサーバは不要です。

## AI が再撮影する前の確認

- launcher が `status: awaiting-install` と `runDir` / `profileDir` を返し、専用
  ウィンドウが開いたことを確認してから native app を取得します。起動失敗後に
  app 名だけで取得すると、
  通常の Chrome が起動・復元される場合があります。表示が専用環境と一致しなければ
  操作・録画を止め、所有する launcher とウィンドウの対応を確認します。
- Playwright のページ動画、スクリーンショット、Web Store の確認ダイアログへの
  到達だけでは native 動画の取得は未確認です。短い試し撮りの実ファイルを再生し、
  ツールバーと必要なダイアログが映ることを確認してから本番を撮ります。
- 録画 UI の起動エラー162や対話的な対象選択の未完了を観測した環境では、終了状態と
  ログを確認してから、許可された方式でウィンドウ ID を指定する手順へ進みます。
  この macOS での観測を、別環境での録画方式の禁止や成功保証に一般化しません。
- native UI の操作後は最新の状態を取得し、対象のラベルと ID を取り直します。
  メニューの開閉、固定・解除、画面遷移で古い ID を再利用しません。
- URL は対応 tool の完全な値の設定・貼り付けを使い、遷移後の URL を確認します。
  今回は逐次入力で URL の先頭が欠落しました。不一致を検出したテイクは失敗として
  保持し、修正後に撮り直します。
- `finish` 後も原本レビューと `finalize.ts` の成功を確認します。CLI の
  `failureCount` は CLI 内の失敗数なので、手動 GUI 操作の失敗も理由と原本名を
  `operations.jsonl` に別途記録します。成功クリップへ失敗テイクを混ぜません。

## 起動と実操作

依存関係と Playwright の Chromium を準備したリポジトリ root で実行します。
ストア版の撮影はローカル build を使いません。

```sh
bun install --frozen-lockfile
bun tools/academy/recording/run.ts --source chrome-web-store --browser chromium
```

`--browser` を省略すると、どちらの導入元でも検証済みの Chrome for Testing
（`chromium` channel）を使います。ストア版では `--browser chrome` の明示指定も
可能ですが、以下のウィンドウ ID helper は Chrome for Testing 専用です。
通常版 Chrome の native 操作・録画方式は別途検証してください。

端末へ `runDir` と一時 `profileDir` が表示されます。このプロセスが開いた専用
ウィンドウだけを操作してください。アカウントへログインせず、他の拡張機能を
追加しません。最初に表示される公式ストアの ID は
`dljblklbpmoocinnlcejeokopmfoldaj` です。

| 端末へ入力  | その前に専用ウィンドウで行うこと                                                        | 検査・記録                                                                                                |
| ----------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `installed` | ネイティブ録画を開始し、「Chrome に追加」から公開版を実際に導入する                     | 拡張 ID、版、導入種別、初期保存設定を `installation.json` に記録                                          |
| `prepare`   | 実 Options で「ウィンドウのすべてのタブを保存」を選び、拡張機能メニューのピンを固定する | 設定、`isOnToolbar`、空の永続化を確認し、6 実タブを開く。準備用のタブを閉じて `before.json` を記録        |
| `verify`    | 録画中にツールバーの本物の TABBIN アイコンをクリックする                                | 元の6タブの終了、保存 URL の完全一致、3 Domain と membership、実 DOM、アクティブな Domain 画面1タブを検証 |
| `finish`    | OS の録画を停止し、原本が書き出されたことを確認する                                     | ページ動画を確定し、専用ブラウザと一時プロファイルを終了・削除する                                        |
| `abort`     | 中断する                                                                                | 失敗として終了し、取得済みの証跡を保持する                                                                |

現在の実装の既定値は「現在開いているドメインのタブをすべて保存」です。
複数ドメイン一括保存のための設定変更を字幕や操作説明に含め、既定動作と
誤認させないでください。未保存の設定は `initialStoredSettings` に `null` として
記録されます。撮影時の実保存設定は `before.json` に残ります。

`prepare` は保存済み fixture を注入しません。許可した6 URL だけに共通 HTML を
返す Playwright route を使い、実際の URL を実際のタブで開きます。既存保存データが
あれば停止するので、再撮影は `abort` 後に同じ起動コマンドで新規プロファイルを
作ってください。コマンド失敗時は証跡を保持し、状態を修正して同じコマンドを
再試行できます。途中 EOF や `abort` は非ゼロ終了です。

## macOS でブラウザ全体を録画する

Playwright の `recordVideo` は Web ページの viewport が対象で、ブラウザの
ツールバーや導入確認ダイアログの録画を代替できません。
`diagnostic-pages/` はそのページ限定の診断動画です。
導入・固定・保存の原本は、OS の録画で別々のクリップとして取得します。

この PoC の実測では macOS 27.2 の `screencapture` にウィンドウ ID を指定すると、
Google Chrome for Testing のツールバーと導入確認ダイアログを収録できました。
画面全体や領域の固定座標を使わず、対象ウィンドウを特定して短い試し撮りを
再生確認してから本番を撮ります。マイク・システム音声は収録しません。

```sh
clang -framework CoreGraphics -framework CoreFoundation \
  tools/academy/recording/macos-window-id.c -o /tmp/tabbin-academy-window-id
/tmp/tabbin-academy-window-id 'TABBIN - Chrome ウェブストア'
```

helper は Google Chrome for Testing の正確なタイトルが一致する、一意の
ウィンドウ ID だけを出力します。通常の Chrome プロファイルへ接続するツールでは
ありません。複数候補や一致なしは停止条件です。表示中の専用ウィンドウと一致する
ことを確認し、各撮影の直前に ID を取り直してください。

別の端末で、実際に表示された `runDir` と確認済み ID を指定します。

```sh
academy_recording_run='recordings/academy/poc-XXXXXX'
academy_window_id=12345
mkdir -p "$academy_recording_run/native"
/usr/sbin/screencapture -v -l"$academy_window_id" -V 55 \
  "$academy_recording_run/native/install.mov"
```

録画開始後に専用ブラウザを操作します。固定は `pin.mov`、保存は `save.mov` として
同じ方式で撮り、各コマンドの終了コードと実ファイルを確認します。固定の撮影では
メニューの「TABBIN を固定」→「固定を解除」→再固定を見せます。字幕は
「固定するとアイコンをツールバーへ常時表示できる」「解除は同じピンをもう一度
押す」を説明してください。`pin.ja.vtt` を原本とともに保持できます。

GUI automation は、この実測では CUA の macOS ネイティブ操作を使用しました。
標準 Chrome の AX 取得の timeout、録画 UI の起動エラー 162、sandbox 内の
録画プロセスの失敗を観測しています。権限付きの同一操作で再確認し、保護の無効化や
通常プロファイルへの切り替えで回避しません。対話的な録画対象選択も実測では
完了しなかったため、確認済み ID の指定を使用しました。

一般の撮影者は OS の録画 UI を手動操作しても構いません。録画先や対象選択が
成立しなければ収録を止め、未取得として残します。GUI 操作と再生確認に必要な
手作業は、環境準備後でも1テイク約5〜10分を見込んでください。

## 原本のレビューと最終判定

`finish` の成功は `pending-native-evidence` です。保存フローの検証だけで、
導入・固定を含む動画の成功にはなりません。各原本を再生し、正しい工程・ブラウザと
本物の UI が映り、個人データ・認証・他の拡張機能が映っていないことを確認します。
動画のヘッダと SHA256 は内容の真正性や再生可能性を証明しません。

```sh
shasum -a 256 "$academy_recording_run/native/"*.mov
```

`runDir/native-review.json` に実際のレビュー結果を記録します。以下の `false` は
レビュー後にだけ `true` へ変更し、各 SHA256 を実ファイルの値へ置換します。
同じ連続原本を複数工程へ指定する場合も、各工程が実際に映っていることを確認します。

```json
{
  "os": "macOS 27.2",
  "browser": "chromium",
  "source": "chrome-web-store",
  "reviewedBy": "映像を確認した担当者",
  "privacyReviewed": false,
  "authenticNativeUi": false,
  "clips": [
    {
      "stage": "install",
      "file": "native/install.mov",
      "sha256": "実際のSHA256",
      "reviewed": false
    },
    {
      "stage": "pin",
      "file": "native/pin.mov",
      "sha256": "実際のSHA256",
      "reviewed": false
    },
    {
      "stage": "save",
      "file": "native/save.mov",
      "sha256": "実際のSHA256",
      "reviewed": false
    }
  ]
}
```

```sh
bun tools/academy/recording/finalize.ts "$academy_recording_run"
```

最終検査は保存証跡を再検証し、公式ストア ID と `installType: normal`、終了済み
プロファイル、導入元とブラウザの一致、3工程の明示レビュー、原本の相対 path・
コンテナヘッダ・SHA256 を要求します。欠落、空ファイル、改ざん、ディレクトリ外への
逸脱は失敗です。成功時だけ `final-result.json` を新規作成し、成功済みの結果を
上書きしません。失敗は非ゼロ終了と `finalization-attempts.jsonl` に残り、証跡を
揃えて同じ run を再検査できます。

`operations.jsonl`、`failure-*.png`、`failure-launch.png`、`result.json`、
`before-empty-persistence.json`、`before.json`、`after.json`、`domain.png` を
切り分けに使います。取得できたものだけが存在します。失敗テイクは原本とログを
残して別名で保持し、合格動画のレビュー対象へ混ぜません。

## 開発版、他 OS、Firefox

開発版の保存挙動だけを調べる場合は別工程として実行できます。

```sh
bun run build
bun tools/academy/recording/run.ts --source unpacked-development
```

この経路は `launchPersistentContext` で展開拡張を読み込みます。ストアでの
インストールではなく、導入動画の合格条件を満たしません。最終 gate も開発版を
公式ストア導入の証拠として受け付けません。

完全な native UI 自動操作は portable な Playwright の範囲外です。自動操作が
成立しない環境では、専用プロファイルで人が操作したネイティブ原本と、その同じ
実 TABBIN 画面のページ動画を編集で継げます。編集点と工程を明記し、別の導入方法や
存在しない操作へ置き換えません。失敗した工程は再撮影または未完了のまま残します。

Windows/Linux は OS 固有の GUI automation・録画装置と権限を別途検証します。
Firefox はストア導入とツールバーの操作が異なり、この launcher の対象外です。
Chrome/Chromium の映像にはブラウザ名を表示し、Firefox 共通 UI として配信しません。
判断の根拠と制約は [ADR 0004](../../../docs/adr/0004-academy-native-recording.md) を参照してください。

## ツールの回帰検証

```sh
bun run test:node tools/academy/recording
```

テストは保存の検証契約、導入経路と段階の境界、ネイティブ証跡の拒否条件を検証します。
実ブラウザの操作と原本の再生レビューは、unit test と別に実施します。

2026-11-07 の実測環境、保存前後の検証結果、原本3本の SHA256 は
[poc-result.json](poc-result.json) に記録しています。これは当日の撮影証跡で、
別の OS・ブラウザ・ストア版での動作保証ではありません。
