# ADR 0005: Academy 動画を TypeScript・Playwright・FFmpeg で制作する

- 状態: 採用
- 日付: 2026-11-07
- 関連: #999、#997、#998、#919、ADR 0004

## 背景と候補

教材の一次ソースは実 TABBIN / ブラウザの操作録画である。Remotion は React / TS の
編集テンプレート候補として評価した。2026-11-07 に確認した
[公式利用条件・価格](https://www.remotion.dev/docs/license/pricing)では、個人または
3人以下の組織は Free License の対象となり得る。対象外では Company License が必要で、
Automators は1 render あたり $0.01・月額最低 $100、Creators は1席月額 $25 とされる。
手動の社内制作と、自動レンダリングを提供する製品とでは適用が異なるため、リポジトリが
公開であることだけで無償利用可能とは判定しない。利用主体・人数・運用の確認前に依存や
有料サービスを追加しない。

この Issue では許容された代替の FFmpeg を採用する。既存 Playwright を使い、
編集用の章カード・字幕だけを PNG に描画する。実アプリの代替画面は作らない。
FFmpeg はローカルの外部制作ツールで、npm の runtime / dev dependency として追加せず、
CI の通常テストから自動 download しない。[FFmpeg のライセンス](https://www.ffmpeg.org/legal.html)
は build オプションにより LGPL / GPL が異なる。実行環境の build 設定・版をログに残し、
実行ファイルやフォントを拡張機能へ再配布しない。Remotion を将来採用する場合は、
その時点の利用主体・制作形態・料金とライセンスを再確認してこの決定を更新する。

## 決定

データ契約を `tools/academy/scenarios/*.json`、検証と実行を TypeScript に置く。
1教材は15〜45秒で、冒頭カード・native 保存クリップ・編集点の章カード・実ページ録画・
終了カードを接続する。シナリオで URL 数・Domain 数・フォーカス対象を指定し、
Playwright の状態検査後に読み取り時間を設ける。固定時間の経過を成功条件にしない。

ADR 0004 の合格した native run を読み取り専用で再検証し、レビューと SHA256 が一致する
原本だけを新しい take にコピーする。保存部分は本物の固定アイコンのクリックであり、
Playwright や背景 API で擬装しない。続きのページでは、その run の実保存 snapshot を
使い捨て開発プロファイルへ再現し、実 UI を操作する。別テイクへの編集点と開発環境への
切替を章カード・manifest に明記する。ブラウザ名を表示し、Chrome の映像を Firefox の
導入・固定方法として扱わない。

MP4 / H.264 / yuv420p / 1280×720 / 30fps / faststart を採用する。ページ収録の WebM / VP9
は中間素材として保持する。H.264 は Chrome・Firefox の一般的な MP4 再生環境を優先する
選択で、Firefox の OS codec 無効環境まで保証しない。WebM の本番配信は今回は生成しない。
実出力のデコード、長さ、寸法、codec、fps、容量、日英 VTT の時刻と内容を検査する。
音声は既定で存在せず、視覚字幕と日英 VTT を生成する。ナレーションは任意の将来拡張とする。

### 同じ27秒教材による形式比較（2026-11-08）

FFmpeg 9.0.2 の同一1280×720・30fps・音声なしの映像で、配信候補を比較した。
MP4 は本パイプラインの完成出力（libx264 / preset medium / CRF 20 / faststart）、
WebM はその完成 MP4 を libvpx-vp9 / CRF 32 / bitrate 0 / row-mt 1 / threads 2 で
再符号化した比較用素材である。形式間の同一画質を保証する設定ではなく、制作時に使う
候補プロファイル1組の実測とする。

| 項目                            | MP4 / H.264                                      | WebM / VP9                                                        |
| ------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------- |
| 長さ・寸法・fps                 | 27秒・1280×720・30fps                            | 27秒・1280×720・30fps                                             |
| ファイルサイズ                  | 283,370 bytes                                    | 528,855 bytes                                                     |
| 品質確認                        | 実UI・字幕・章カードを目視確認した基準映像       | 全810フレームをdecode。MP4基準のSSIM All 0.998863、字幕表示も確認 |
| Chrome for Testing 156.0.8078.4 | 再生・pause・1.5倍速・8秒seek・英語VTT表示が成功 | 同じ操作・VTT表示が成功                                           |
| Firefox 157.0                   | 同上                                             | 同上                                                              |

この素材と設定では MP4 の方が小さく、両ブラウザで操作と字幕表示を確認できたため、
検証済み MP4 を本番用出力として維持する。WebM は比較用の代替候補として記録し、
本番用の生成・登録機能は追加しない。SSIM は既に圧縮された MP4 に対する追加圧縮の
差を測った値で、元録画に対する絶対品質や、codec 一般の優劣を示すものではない。
別素材・encoder 設定・OS codec 環境で結果が変わる可能性がある。再比較には
[実測記録](../../tools/academy/pipeline/sample-result.json)の入力 hash と設定を使う。

制作は browser version、DPR 1、light、ja-JP、UTC、fixture seed を固定する。
字幕・カードのフォントは操作者がローカルで利用許諾を持つファイルを明示し、
その内容の SHA256 と描画 browser version、FFmpeg version を保存する。OS、font、
browser の違う take のバイト一致は主張しない。同じ version / seed / 入力から同じ
操作順と編集区間を再生成でき、原本・完成動画の hash と frame 比較で差分をレビューする。

失敗時は take を保持し、撮影済みなら trace / screenshot と段階別ログを残す。
検証済み take を immutable な release directory に移し、最後に `latest.json` を atomic
rename で更新する。失敗した素材で前回成功を上書きしない。自動検証の成功と教材内容の
目視確認は分け、製品へ配置する前に保存操作、字幕、編集点、privacy を再生確認する。

## 配布境界と rollback

`recordings/academy/` の素材と中間生成物は git / WXT bundle / source ZIP の対象外。
制作依存は既存 dev の Playwright のみで、アプリの import・権限・保存形式は変えない。
必要になった完成 MP4 / VTT だけを別の内容制作 Issue で `public/academy/videos/` へ配置し、
既存 Academy の選択レッスン単位の遅延読み込みへ登録する。全8本の制作や製品への自動公開は
対象外。rollback は制作ツールと scripts の撤回で完結し、ユーザーデータ移行は不要。

## 参照

- [Playwright on-demand screencast](https://github.com/microsoft/playwright/blob/v1.64.1/docs/src/api/class-screencast.md)
- [FFmpeg filters](https://ffmpeg.org/ffmpeg-filters.html)
- [制作手順](../../tools/academy/pipeline/README.md)
