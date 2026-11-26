/**
 * 選択した保存タブを Markdown のリンクリストへ変換する (issue #930)。
 *
 * 形式は `- [タイトル](URL)` の箇条書き。タイトル内の角括弧や
 * バックスラッシュ、山括弧、バッククォート、強調記号、文字参照の開始
 * 文字は Markdown の構文として解釈されないようエスケープする。URL は
 * 空白・括弧・山括弧を含む場合に `<...>` 形式で包み、文字参照として
 * 解釈される `&...;` の開始 `&` は `&amp;` にする。いずれもパース後に
 * 元のタイトル・URL に戻るため、URL 自体は変更しない。
 */

type MarkdownLinkItem = {
  readonly title: string
  readonly url: string
}

/**
 * `&` のうち CommonMark で文字参照として解釈されるものだけを対象にする。
 * `?a=1&b=2` のような通常のクエリー区切りの `&` は文字参照にならない
 * ため対象外。対象は `&copy;` のような名前付き参照と `&#65;` /
 * `&#x41;` のような数値参照。
 */
const ENTITY_REFERENCE_START =
  /&(?=(?:#[0-9]+|#[xX][0-9A-Fa-f]+|[A-Za-z][A-Za-z0-9]*);)/g

const escapeLinkText = (title: string): string =>
  title
    .replace(/\\/g, String.raw`\\`)
    .replace(/\[/g, String.raw`\[`)
    .replace(/\]/g, String.raw`\]`)
    .replace(/</g, String.raw`\<`)
    .replace(/>/g, String.raw`\>`)
    .replace(/`/g, String.raw`\``)
    .replace(/\*/g, String.raw`\*`)
    .replace(/_/g, String.raw`\_`)
    .replace(ENTITY_REFERENCE_START, String.raw`\&`)
    .replace(/[\r\n]+/g, ' ')
    .trim()

const formatLinkDestination = (url: string): string => {
  // 空白・括弧・山括弧を含まない URL はそのまま書ける。ただし `&copy;`
  // のような文字参照は CommonMark で解釈されて URL が変わるため、
  // 開始の `&` だけ `&amp;` にする（パース後に元の URL に戻る）。
  // それ以外は CommonMark の <...> 形式で包み、中の記号をエスケープする。
  if (!/[\s()<>]/.test(url)) {
    return url.replace(ENTITY_REFERENCE_START, '&amp;')
  }
  return `<${url
    .replace(ENTITY_REFERENCE_START, '&amp;')
    .replace(/\\/g, String.raw`\\`)
    .replace(/</g, String.raw`\<`)
    .replace(/>/g, String.raw`\>`)}>`
}

export const buildMarkdownLinkList = (
  items: readonly MarkdownLinkItem[],
): string =>
  items
    .map(({ title, url }) => {
      const label = escapeLinkText(title) || escapeLinkText(url)
      return `- [${label}](${formatLinkDestination(url)})`
    })
    .join('\n')
