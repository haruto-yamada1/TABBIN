# 拡張機能の artifact size と regression policy

Issue [#723](https://github.com/haruto-yamada1/TABBIN/issues/723) の継続計測。
CI の **Verify Build** は Chrome / Firefox を `wxt zip` でビルド・梱包し、
チェックインした baseline と比較する。依存更新を含む全 PR が対象で、path filter は設けない。
結果は Actions run の Summary と `extension-size-report` artifact（30 日保存）で確認できる。
PR コメント書き込みや追加の token は不要で、fork / Dependabot PR でも同じ経路を使う。

## ローカル実行

リポジトリルートで、指定の Node / Bun と lockfile を使う。

```bash
bun install --frozen-lockfile
bun run zip
bun run zip:firefox
bun run size:loads
bun run size:report
```

出力は `.output/size-report/report.md` と `report.json`、画面別の
`initial-load-observations.json` / `initial-load-report.json`。
JSON は次回比較にも使える。ZIP はビルドを含むので、事前の `build` は不要。
両ブラウザの ZIP を毎回生成してから計測する。`size:loads` はインストール済みの Playwright Chromium / Firefox と
GeckoDriver 0.37.1（`GECKODRIVER_PATH`、既定は PATH）を使う。
`FIREFOX_EXECUTABLE_PATH` で Firefox binary を指定できる。
`size:report` は HEAD と両 artifact の SHA-256 が観測結果と一致しない場合に拒否する。
ZIP と展開済み artifact の内容一致は従来どおりビルド手順で保証する。

```bash
bun run size:report --baseline /absolute/path/to/previous-report.json
```

base branch に reporter が導入された後は、その branch の隔離 worktree で同じ runtime と
lockfile による ZIP と report JSON を生成し、`--baseline` にその JSON を渡して比較できる。
通常の CI は固定 baseline を使うため、小さな増加の累積も確認できる。

## 計測対象と読み方

- **zipBytes**: `.output/tabbin-<package version>-chrome.zip` / `firefox.zip`
  の実ファイルサイズ。Firefox の提出用 `sources.zip` は含めない。
- **unpackedBytes**: 各ブラウザの出力ディレクトリ内の全ファイルの合計。
  manifest、HTML、CSS、画像、隠しファイルも含む。
- **javascriptBytes**: 全 `.js` の合計。共有チャンクも 1 回だけ数える。
- **assetCount**: ファイル数。増減は情報表示のみで、size regression の判定に使わない。
- **chunkGroupCount**: `chunks` のキー数（JavaScript の正規化後のグループ数）。
  baseline / current / delta を `assetCount` と同じ表に情報表示する。
  同名に正規化される複数ファイルを 1 group と数えるため、JavaScript の実ファイル数とは異なる。
  asset 数だけが増えた場合と group 数も増えた場合を総容量と合わせて確認する。
- **Entry scripts**: `background.js` と HTML が直接参照するスクリプトのサイズ。
  import 先の依存を含まず、ページの初期ロード全体の計測ではない。
- **Feature chunks**: `*Route*` / `*ChatWidget*` を名前で抽出した表。
  analytics、options、saved-tabs、AI chat の所在を追えるが、機能の依存合計ではない。
  名前が変わった場合も全 JavaScript 表には残る。
- **Largest assets**: 種類を問わず大きい順の上位 10 ファイル。実ファイル名も表示する。
- **All JavaScript chunk groups**: 全 `.js` の増減。末尾の
  `-<8 文字の WXT / Vite hash>.js` だけを除去して比較する。
  同名になる複数ファイルは合算する（例: `javascript` / `css` / `dist`）。
  dependency 内部の名前に含まれる hash は維持するため、更新時に added / removed に
  分かれることがある。その場合は総容量と合わせて判断する。

saved-tabs / options / ai-chat の HTML entry は現状 82 B のリダイレクトである。
その数値だけで軽量と判断せず、`app` entry、画面 route、共有 chunk の表も確認する。
同じファイルが entry 表と chunk 表に現れるため、表を横断して足し合わせない。
code splitting でファイル数が増えても総容量が維持されるケースを区別できる。

## 画面別の初期 JS ソース予算（Issue #926）

ZIP / entry 単体の baseline は維持し、画面別 baseline を
`tools/bundle-size/initial-load-baseline.json` に独立して保存する。
byte 計測は既存の `collectArtifactSize` を再利用する。

対象は実際の production `app.html` の Saved Tabs（domain）、Options、
AI Chat、Analytics。各画面・各ブラウザに新しい profile を使い、空の保存データ・
英語・既定設定でユーザー操作前の最初の表示を測る。
`size:loads` 自体が Playwright E2E で、対象 route の表示と非対象 route の lazy 境界も検証する。
既存の小さな `saved-tabs.html` / `options.html` / `ai-chat.html` redirect は含めず、
遷移後の canonical route を直接開く。

拡張ページの Resource Timing は Chrome / Firefox とも JS を列挙しないため使用しない。
Chrome は対象 page の CDP `Debugger.scriptParsed`、Firefox は一時 XPI の
対象 document global に対する native Debugger の source 一覧を使う。
Firefox の一時 manifest は Gecko ID だけを補い、production scripts と background は保持する。
画面固有の ready selector を満たし、モジュール集合が 500 ms 安定した時点で確定する。
Chrome では同時に JS request の完了を確認する。30 秒以内に ready / 完了が確認できない、
欠落画面、未知の JS、artifact / revision 不一致は計測失敗として CI を失敗させる。
Chrome では加えて uncaught page error も検出する。Firefox は ready と Debugger source の
取得を検証し、汎用的な page error collector は備えない。

- **画面別 JavaScript bytes** は browser debugger が観測した packaged JS ファイルの
  非圧縮ソース量。modulepreload が実際に解析したソースも含み、inline / eval と
  background / install 時に開いた別タブは含めない。
- ブラウザは遅延解析を行うため、ソース量は解析入力の規模を示す。解析 CPU 時間や
  メモリ、HTTP 通信量を測った値ではない。ローカル拡張の `transferSize=0` を
  軽量と解釈しない。install 時の自動表示で cache が温まる場合もあるため、cold HTTP の
  benchmark として扱わない。
- 同じ physical path は各画面内で一度だけ数える。hash 正規化による同名 group を
  この計測で合算・同一視しない。
- **Shared subset** は複数画面が解析した同じファイルの部分集合。
  各画面の total に既に含まれるため再加算しない。
- **Unique union** は全画面の集合和であり、共有 JS を一度だけ数える。
  画面別 total 同士や artifact total / entry 表との合計はしない。

JSON には feature ごとの physical path と byte 数、共有分、集合和、revision、
runtime / browser version、artifact digest を残す。保存データ、会話、個人 URL、
ユーザー profile は採取しない。全 profile / XPI / driver は計測後に破棄する。

CI の Verify Build で既存の両 production ZIP の生成後に計測し、既存の Actions Summary と
`extension-size-report` artifact に統合する。ブラウザは cache し、GeckoDriver は既存の
Firefox 検証と同じ version / SHA-256 で検証する。別の bundle-size ライブラリや
permission は追加しない。
画面別 total と集合和にも既存 policy の 5% 超 `report` / 10% 超 `review required` を適用し、
絶対差も併記する。増加自体は advisory とし、計測失敗と区別する。
新規の hard budget は一回の baseline だけを根拠に設定しない。

初回の画面別 baseline は production source を変更せず、2026-10-23 に
revision `e4154a9479f3fb8c4797767dcd8891e8f686ff71` から採取した。
macOS arm64、Node 24.22.1 / Bun 1.3.14、Chromium 153.0.8010.12 / Firefox 155.0。
両ブラウザで module path 集合と byte 数が一致した。

| Screen / 集合 |                 Chrome |                Firefox |
| ------------- | ---------------------: | ---------------------: |
| Saved Tabs    | 1,200,490 B / 34 files | 1,200,490 B / 34 files |
| Options       |   973,582 B / 35 files |   973,582 B / 35 files |
| AI Chat       | 2,014,913 B / 35 files | 2,014,913 B / 35 files |
| Analytics     |   918,894 B / 33 files |   918,894 B / 33 files |
| Unique union  |            2,544,553 B |            2,544,553 B |
| Shared subset |              894,739 B |              894,739 B |

画面別 baseline の更新は、元の比較結果と採用理由を保存してから明示的に行う。

```bash
bun run size:report --write-load-baseline tools/bundle-size/initial-load-baseline.json
```

通常の計測・CI は baseline を更新しない。シナリオや解析観測方式を変える場合は
`scenario` / `method` の version も更新して再計測する。

## 初回 baseline

拡張機能のコードを変更せず、2026-09-15 に次の commit から採取した。

- Revision: `3d3adc67f3be86b7acbcb2afa7785b39aa2ff4a0`
- Version: `2.0.19`
- Runtime / platform: `tools/bundle-size/baseline.json` の `environment`

| Metric                            |      Chrome |     Firefox |
| --------------------------------- | ----------: | ----------: |
| ZIP                               | 2,021,363 B | 2,021,384 B |
| 展開後合計                        | 7,593,815 B | 7,593,850 B |
| JavaScript 合計                   | 7,468,336 B | 7,468,336 B |
| ファイル数                        |         152 |         152 |
| background                        |   944,733 B |   944,733 B |
| 最大 asset（SavedTabsChatWidget） | 1,138,725 B | 1,138,725 B |

初回は macOS で採取した値であり、CI の Linux と異なる。
OS、runtime、圧縮実装の差による変動も含め、最初の CI の数値を確認する。
ZIP は圧縮後の実配布容量、展開後と JavaScript は圧縮率に依存しない増加を見る指標になる。

## Regression と hard budget

設定の source of truth は `tools/bundle-size/policy.json`。

| baseline に対する増加       | 表示                      | CI の扱い                             |
| --------------------------- | ------------------------- | ------------------------------------- |
| 5% 以下（減少も含む）       | unchanged / within policy | 成功                                  |
| 5% 超〜10% 以下             | report                    | 成功。増加原因を確認                  |
| 10% 超                      | review required           | 成功。PR レビューで理由・妥当性を確認 |
| 明示された hard budget 超過 | metric、上限、理由        | 失敗                                  |

絶対 byte 差と割合を常に表示する。新規・削除は added / removed、基準 0 の割合は n/a。
`review required` はレビューを促す表示であり、GitHub の承認ルールを自動設定しない。
entry が 82 B のように小さい場合、率だけで判断せず絶対差も確認する。

初回実測は一つで通常の変動幅がまだ分からないため、**hardBudgets は空**。
約 2.02 MB の ZIP や約 7.59 MB の展開後合計だけを根拠に一律の上限は決めない。
初回から通常の機能追加・依存更新を失敗させず、5% / 10% を観測とレビューの目安にする。

hard budget を追加する場合は、`browser`（chrome / firefox）、`metric`
（zipBytes / unpackedBytes / javascriptBytes）、`maxBytes`、`reason` を設定する。
store 制限や複数回の実測・許容する増加量など、上限の根拠と決定を PR に記録する。
上限と等しい値は成功し、超えた場合だけ失敗する。report は失敗時も先に出力・保存される。
不正な設定、未知の metric、負数、欠落した baseline / ZIP / 必須 entry はエラーにする。

## Baseline の更新

増加の警告を消すためだけに更新しない。受け入れた依存更新や機能追加の累積を整理するとき、
元の baseline と比較した report をレビュー証跡に残し、理由を添えて更新する。
計測対象のソースが clean な commit の状態で、両 ZIP を生成してから次を実行する。

```bash
bun run size:report --write-baseline tools/bundle-size/baseline.json
```

この明示オプションのみ baseline を更新する。通常の CI / `size:report` は更新しない。
JSON の revision、environment、両ブラウザの数値を確認して commit する。
ZIP の圧縮設定や chunk 命名規則を変える場合は、比較の互換性と schemaVersion も検討する。
