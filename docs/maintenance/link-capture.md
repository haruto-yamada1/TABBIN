# ページ上のリンク選択と保存

Issue #1047・#1048。設定の「リンクの一括選択・保存」を ON にすると、閲覧中の
HTTP(S) ページで、登録キーを押しながら左ドラッグしてリンクを保存できます。
初期設定は OFF、初期キーは物理キー `KeyZ` です。通常の件数ではドラッグ終了後に
即時保存し、TABBIN 画面を開きません。フォーカスしたリンクは登録キー＋Enter
でも保存できます。

「リンク保存操作」を ON にすると、別に登録したキー＋左クリックで1件を保存できます。
こちらも初期 OFF、初期キーは `KeyZ`。両方に同じキーを使う場合は、6 CSS pixel 以上の
ドラッグが矩形選択を優先し、移動しないクリックが1件保存になります。ドラッグ後の
合成クリックは保存しません。クリック用キーに Ctrl・Alt・Shift・Meta を含めると
ブラウザの新規タブ・新規ウィンドウ・ダウンロード等と競合するため、理由を示して
拒否します。通常クリック、中・右クリック、修飾キー操作、編集・IME 中は保持します。
クリック対象は子要素を含むリンクで、open Shadow DOM 内にも対応します。
`display:contents` のリンクや、アンカー自身の表示ボックス外に配置した子要素も、
実際のクリック対象から判定します。Shadow ホストの無効・非表示状態を尊重します。

クリックは有効なリンクへの押下・解放・クリックが揃った時点でのみ通常遷移を抑止します。
連続操作はページ内の上限付きキューで直列化し、未完了の同一 URL はまとめます。
送信・保存の失敗は通知と再試行対象を残し、元ページを維持します。キューが1,000件に
達した場合は追加できなかった旨を表示し、既存の失敗通知と再試行ボタンは保持します。
iframe は対象外です。

## キーとページ操作

「キーを変更」は実際に届いた `KeyboardEvent.code` と修飾キー状態を記録します。
登録は固定プリセットに限定しません。英数字、記号、使用可能なファンクションキー、
修飾キー単独・組み合わせを受け付けます。判定には物理位置の `code` を使用し、
表示には同時に取得した `key` を併記するため、キーボード配列による文字の違いを
区別できます。リセットは `KeyZ` に戻します。

ブラウザの編集・タブ移動・再読み込み等と衝突するキー、Escape、IME 変換中、
AltGraph、Dead/Process/Unidentified 等は拒否します。OS がブラウザへ渡さない
キーを登録済みとして扱わず、レコーダーは 10 秒で時間切れを表示します。
OS 固有のすべてのショートカットを列挙できる保証はなく、異なる OS でのキー取得は
実環境で確認する必要があります。

入力欄・contenteditable・ARIA textbox 等の編集要素や IME 変換中は起動しません。
キーを押しただけでは既定動作を妨げず、左ドラッグが開始しきい値を超えてから選択を
開始します。キーを離す、Escape、フォーカス喪失、ページ非表示、ページ離脱、
無効化で中止します。iframe 内は対象外です。

選択候補は通常の HTML アンカー `a[href]` です。非表示・無効・fragment-only・
HTTP(S) 以外のリンクを除き、表示矩形の交差を使って複数行・画像リンクも扱います。
相対 URL は文書の `baseURI`（HTML の `<base href>` を含む）から実際のリンク先へ解決します。候補をキャッシュし、DOM 変更で再構築し、
描画は requestAnimationFrame にまとめます。画面端ではスクロールできます。

## 権限と生命周期

必須 permission の追加はありません。既存の optional `scripting` と optional
host permission `http://*/*` / `https://*/*` を再利用します。ON のユーザー操作で
ページアクセスを説明して要求し、拒否時には OFF を維持します。ページアクセスへの
同意は、ブラウザ設定から撤回できます。既存の保存済みタブのタイトル表示にも使う
共有権限なので、片方の機能を OFF にする操作だけでは共有権限を削除しません。

`tabbin-link-capture` を動的登録し、設定・権限・更新・ブラウザ起動・MV3 worker の
起動時に登録状態と照合します。両方が OFF の場合と権限撤回では登録解除に加え、既に開いたページへ
停止を通知します。登録解除だけでは注入済みのコードを削除しないためです。
稼働中ページへの再注入は同じ controller を再利用し、確認中・再試行待ちのバッチを
消しません。制限ページ、Web Store、権限のないページには適用できません。

Chrome の [scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting)
は `scripting` と対象ページのアクセス権限を要求します。
[Firefox の registerContentScripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/scripting/registerContentScripts)
は Firefox 102 以降では MV2 でも利用できます。登録・権限の Promise API には
`wxt/browser` を使い、Firefox の callback-only な `chrome` API と混同しません。
[Firefox の match pattern は port を含められない](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Match_patterns)
ため、sender の URL そのものの検証とは別に、権限の照会には port を除いた
`scheme://hostname/*` を使います。この機能の ON には既存の HTTP(S) 全体の
optional host grant が必要であり、この照会で権限を拡大しません。

設定は既存の device-local `linkCaptureSettings` に `clickEnabled` と `clickShortcut` を追加します。
旧形式の `enabled` / `shortcut` は矩形選択用として保持し、新フィールドがない場合だけ
クリック OFF と初期キーを補います。既存データを暗黙に書き換えません。不正な値は
読み込みエラーにし、有効化や保存を止めます。同期は同一ブラウザ内の `storage.onChanged`。
既存と同じく Backup V2 / userSettings / recovery には含めません。IndexedDB の変更は不要です。
旧版へ戻した場合、新フィールドを解釈できない旧設定バリデーターはリンク操作を停止しますが、
保存済みURLや他の設定は変更しません。

## 保存・件数・既存データの扱い

content script は選択した `{url,title}` だけを background へ渡します。ページ本文の
保存、第三者への送信、リンク先の取得やタブの作成・削除・移動・ピン留めはしません。
保存先を選ぶ Custom 専用 UI は追加しません。

background は、この拡張の HTTP(S) ページの top-frame sender、非プライベートな
タブ ID、機能の有効状態、現在の host/scripting 権限、既存の除外設定を検証します。
不正設定・権限喪失・読み取り失敗では保存を始めません。メッセージには 1000 件、
URL 8192 文字、タイトル 512 文字、合計テキスト 524288 文字の上限があり、UUID を
要求します。操作種別は `mode: click | rectangle` で検証し、未指定は旧形式の矩形選択です。
操作ごとに有効設定を確認し、片方が有効でも他方の保存を許可しません。HTTP(S) 以外・資格情報を含む URL・除外パターン一致を保存しません。

| フィールド   | 意味                                                            |
| ------------ | --------------------------------------------------------------- |
| `saved`      | この処理で新規作成してコミットした URL 数                       |
| `existing`   | 保存時点で既に存在し、変更しなかった URL 数                     |
| `duplicates` | 受信バッチ内で同一の URL が繰り返された数                       |
| `excluded`   | background のスキーム・資格情報・除外ルールで除いた数           |
| `failed`     | 永続化失敗時に新規保存予定だった数。成功数には加えない          |
| `newCount`   | preview では現時点の新規候補数、保存成功時には実際の `saved` 数 |

ページ上の選択数は同じ解決済み URL を 1 件として数えます。非表示等で選択対象に
ならないアンカーは、background の `excluded` に含みません。50 件を超える異なる
有効リンクでは、保存前に新規・既存数と対象一覧を確認します。preview は読み取り
のみなので、その後ほかのウィンドウから保存されると実際の件数は変わり得ます。

保存は既存の `BackgroundSavedTabsDataPlane.saveTabs` に
`{preserveExisting:true}` を渡し、同じ IndexedDB セッション内で既存 URL を除いてから
通常の Domain 分類・キーワードによる Custom 同期を実行します。受け取った URL を
background で再シリアライズせず、`exact-url-v1` に従って文字列の同一性を維持します。
既存 URL のタイトル・保存日時・お気に入り・notes・membership・順序は変更しません。
将来タイトルの provenance フィールドが増えても、既存レコードへの上書きを行わない
ため保持されます。

content からの保存を直列化し、ほかの保存元との競合には既存の IndexedDB revision
検査を適用します。同じ tab/document/UUID の再送には一時的な応答キャッシュを使います。
worker 再起動やキャッシュから追い出された後の再送でも、トランザクション内の既存判定が重複保存と
メタデータ変更を防ぎます。成功応答が失われた場合、再試行は新規 0・既存 N になる
ことがあります。永続化エラー時の選択内容はページ内に残し、明示的に再試行できます。

Undo は提供しません。ほかの操作の保存を巻き戻すスナップショット復元は使用しません。
このバッチで作成した membership だけを安全に取り消す設計は follow-up 候補です。
この機能の追加では IndexedDB スキーマを変更せず、OFF に戻しても保存済みデータは
保持されます。

## 検証

背景処理の unit/integration テストは、不正 sender・サイズ上限・除外設定読み取り失敗・
権限撤回・同時送信・UUID 再送・異なるタブ/文書の分離・worker 再生成後の再送を
検証します。fake-indexeddb を用いる production composition のテストでは、接続 close/reopen と data plane
再生成後も既存のタイトル・お気に入り・notes・membership が変わらず、新規リンクが
残ることを確認します。

ページ選択・Options・実拡張 E2E・Firefox/OS ごとの実測結果とスクリーンショットは
PR の検証欄に記録します。unit テストでの API mock 成功だけをブラウザ互換性や
ネイティブ権限 UI の成功として扱いません。

### キー＋クリック保存の検証（#1048）

2026-11-18、macOS ホスト上の Chromium 実拡張テストで、新規6件と既存の
矩形選択 geometry 1件が成功しました。

- OFF・未許可時の通常ナビゲーション、通常クリック・不一致キー・標準の修飾クリック。
- 相対 URL と `<base>`、ネスト・画像・open Shadow DOM、既存 URL・除外 URL。
- `display:contents`、アンカー外に位置した子、親の visibility を上書きした可視リンク。
- 同じキーのドラッグ優先、元ページ・全タブ ID/URL/pin の維持。
- 手動タイトル・favorite・notes・既存 membership の保持と通常 Domain/Custom 分類。
- MV3 worker 停止後の保存、稼働中ページへのキー変更・OFF・権限撤回の反映。

再実行は `bun run e2e e2e/link-click-capture.extension.spec.ts e2e/link-capture-geometry.extension.spec.ts --project=extension --workers=1`。
日英 Options と狭い幅のダーク表示は `docs/assets/issue-1048-options-*.png` にあります。

同日の Firefox 157 の製品 artifact でも、ネイティブ権限ダイアログの拒否・許可、
クリックだけを ON にした1件保存とタイトル、同じキーの矩形30件保存、タブ一覧の
維持、矩形だけの OFF、権限撤回、戻る操作を確認しました。合計31 URLが残ります。
今回の戻る操作では BFCache は使われず、persisted 復帰は DOM テストで確認しています。
`bun run test:firefox:link-capture` で再実行できます。

設定の同時更新は共有 Web Lock 内で最新値を読み、部分更新だけを書き込みます。
2つの設定カードのトグル・キー保存、および別 Options ページの更新を回帰テストで
検証します。ロック取得・設定読み取りが失敗した場合は書き込みません。

### Chromium での性能・キー変更の実測

2026-11-17、macOS ホストの Playwright Chromium 拡張テストで、候補アンカーを
100 / 500 / 1000 件に増やし、最初の 30 件を 50 段階の実マウス入力で囲んで計測しました。
キーを離して中止し、各ケースでタブ ID/URL/pin 状態と保存データが変わらないことを
確認しました。測定はこの fixture と実行環境での観測であり、性能保証の閾値にはしていません。

| DOM 内のリンク候補数 | rAF サンプル | ドラッグ時間 | フレーム間隔 p95 | 最大間隔 | 50ms 超 Long Task |
| -------------------- | ------------ | ------------ | ---------------- | -------- | ----------------- |
| 100                  | 52           | 883.4ms      | 16.7ms           | 16.8ms   | 0                 |
| 500                  | 50           | 857.0ms      | 16.8ms           | 16.8ms   | 0                 |
| 1000                 | 50           | 857.4ms      | 16.8ms           | 16.8ms   | 0                 |

測定時の `navigator.platform` は `MacIntel`。
`navigator.userAgent` は fixture の Desktop Chrome device 設定により
`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.8078.4 Safari/537.36`
でした。UA の Windows 表記はエミュレーションであり、Windows 実機検証の証拠ではありません。

同じ実拡張 E2E で Options のレコーダーから `Shift+S` を登録し、開いたままのページへ
変更が反映され、フォーカスした 1 リンクを Shift+S を保持して Enter で保存できることを
確認しました。元リンクへ遷移せず、タブ一覧は変わりませんでした。

再実行コマンドは
`bun run e2e e2e/link-capture-performance.extension.spec.ts --project=extension --workers=1`。
4 テストが成功し、各性能値・UA・platform は Playwright の JSON 添付にも残します。

### Firefox と UI の実測

2026-11-17、macOS 上の Firefox 157.0 と製品の MV2 artifact を、専用一時プロファイルで
起動しました。Options のユーザー操作で実際の権限ダイアログを開き、拒否で OFF の維持、
再操作による許可、30 リンクの矩形選択・永続化、保存前後の全タブ ID/URL の一致、
権限撤回後のページ監視停止と、戻る遷移後の再開・権限撤回後に戻ったページの監視停止を確認しました。
この Firefox 実測では BFCache は使われず通常再読込でした。persisted な BFCache 復帰の
有効・OFF・権限拒否の挙動は DOM 回帰テストで検証しています。
`bun run test:firefox:link-capture` で再実行できます。release:e2e にも含めます。

Chromium では通常保存・50 件超の確認・既存数の表示・元タブの維持・OFF・権限撤回・
MV3 worker 停止後の保存再開を検証しました。日英 Options と矩形選択の画像は
`docs/assets/issue-1047-*.png` にあります。

Windows/Linux 実機のキー配送、OS 独自ショートカット、ブラウザストアやサイト側の
独自キー操作との全組み合わせは未実測です。競合一覧で除けないサイト独自操作はあり得るため、
利用するページで別の取得可能なキーへ変更してください。固定・sticky・transform・scroll・
複数行・不可視アンカーの矩形はブラウザの CSS pixel の client rect を利用します。

BFCache の pagehide では選択を中止して休止し、pageshow では設定と background の
読み取り専用 preview（空バッチ）で権限を再検証します。復元中に権限や設定を確認
できない場合は監視を停止します。
