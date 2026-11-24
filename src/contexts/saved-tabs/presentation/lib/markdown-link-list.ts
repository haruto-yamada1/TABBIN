/**
 * 選択した保存タブを Markdown のリンクリストへ変換する (issue #930)。
 *
 * 形式は `- [タイトル](URL)` の箇条書き。タイトル内の角括弧や
 * バックスラッシュ、URL 内の空白・括弧・山括弧は Markdown の
 * リンク記法が壊れないようエスケープし、URL 自体は変更しない。
 */

type MarkdownLinkItem = {
  readonly title: string
  readonly url: string
}

const escapeLinkText = (title: string): string =>
  title
    .replace(/\\/g, String.raw`\\`)
    .replace(/\[/g, String.raw`\[`)
    .replace(/\]/g, String.raw`\]`)
    .replace(/[\r\n]+/g, ' ')
    .trim()

const formatLinkDestination = (url: string): string => {
  // 空白・括弧・山括弧を含まない URL はそのまま書ける。それ以外は
  // CommonMark の <...> 形式で包み、中の記号をエスケープする。
  if (!/[\s()<>]/.test(url)) {
    return url
  }
  return `<${url
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
