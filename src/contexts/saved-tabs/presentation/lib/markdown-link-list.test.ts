import { describe, expect, it } from 'vitest'

import { buildMarkdownLinkList } from './markdown-link-list'

describe('buildMarkdownLinkList', () => {
  it('タイトルとURLを Markdown リンクの箇条書きにする', () => {
    expect(
      buildMarkdownLinkList([
        { title: 'Example', url: 'https://example.com/' },
        { title: 'Docs', url: 'https://example.com/docs?a=1&b=2' },
      ]),
    ).toBe(
      '- [Example](https://example.com/)\n- [Docs](https://example.com/docs?a=1&b=2)',
    )
  })

  it('タイトル内の角括弧とバックスラッシュをエスケープする', () => {
    expect(
      buildMarkdownLinkList([
        {
          title: String.raw`Guide [v2] \ draft`,
          url: 'https://example.com/guide',
        },
      ]),
    ).toBe(String.raw`- [Guide \[v2\] \\ draft](https://example.com/guide)`)
  })

  it('タイトル内の改行は空白に置き換える', () => {
    expect(
      buildMarkdownLinkList([
        { title: 'Line1\nLine2', url: 'https://example.com/' },
      ]),
    ).toBe('- [Line1 Line2](https://example.com/)')
  })

  it('括弧を含む URL は <...> 形式で包み、URL 自体は変更しない', () => {
    const url = 'https://en.wikipedia.org/wiki/Tab_(interface)'
    expect(buildMarkdownLinkList([{ title: 'Tab', url }])).toBe(
      `- [Tab](<${url}>)`,
    )
  })

  it('タイトル内の山括弧・バッククォート・強調記号をエスケープする', () => {
    expect(
      buildMarkdownLinkList([
        {
          title: 'Array<T> `code` *bold* _em_',
          url: 'https://example.com/',
        },
      ]),
    ).toBe(
      String.raw`- [Array\<T\> \`code\` \*bold\* \_em\_](https://example.com/)`,
    )
  })

  it('タイトル内の文字参照は開始文字をエスケープし、通常の & はそのままにする', () => {
    expect(
      buildMarkdownLinkList([
        { title: 'A &copy; B', url: 'https://example.com/' },
        { title: 'Tom & Jerry', url: 'https://example.com/' },
      ]),
    ).toBe(
      '- [A \\&copy; B](https://example.com/)\n- [Tom & Jerry](https://example.com/)',
    )
  })

  it('URL 内の文字参照は &amp; にして元の URL を保持する', () => {
    expect(
      buildMarkdownLinkList([
        { title: 'x', url: 'https://example.com/?q=&copy;' },
        { title: 'y', url: 'https://example.com/?q=&amp;x' },
      ]),
    ).toBe(
      '- [x](https://example.com/?q=&amp;copy;)\n- [y](https://example.com/?q=&amp;amp;x)',
    )
  })

  it('<...> 形式の URL でも文字参照は &amp; にする', () => {
    const url = 'https://example.com/wiki/A_(b)?q=&copy;'
    expect(buildMarkdownLinkList([{ title: 'x', url }])).toBe(
      '- [x](<https://example.com/wiki/A_(b)?q=&amp;copy;>)',
    )
  })

  it('タイトルが空なら URL をラベルに使う', () => {
    expect(
      buildMarkdownLinkList([{ title: '  ', url: 'https://example.com/x' }]),
    ).toBe('- [https://example.com/x](https://example.com/x)')
  })

  it('空のリストは空文字列を返す', () => {
    expect(buildMarkdownLinkList([])).toBe('')
  })
})
