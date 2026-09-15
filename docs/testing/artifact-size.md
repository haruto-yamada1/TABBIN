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
bun run size:report
```

出力は `.output/size-report/report.md` と `report.json`。
JSON は次回比較にも使える。ZIP はビルドを含むので、事前の `build` は不要。
両ブラウザの ZIP を毎回生成してから計測する。単独の `size:report` は既存成果物を読み、
ZIP の内容とソースの鮮度を保証しない。

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

## 初回 baseline

拡張機能のコードを変更せず、2026-09-15 に次の commit から採取した。

- Revision: `3d3adc67f3be86b7acbcb2afa7785b39aa2ff4a0`
- Version: `2.0.16`
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
