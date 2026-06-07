import { describe, expect, it } from 'vitest' // eslint-disable-line

import {
  getDocumentTitle,
  resolveDocumentTitle,
  resolveDocumentTitleFromPathname,
  resolveTitleKey,
  resolveTitlePageKeyFromPathname,
} from './title'

describe('title helpers', () => {
  it('ページ ID をタイトルキーへ解決する', () => {
    expect(resolveTitleKey('options')).toBe('htmlTitle.options')
    expect(resolveTitleKey('changelog')).toBe('htmlTitle.changelog')
  })

  it('言語に応じた document title を返す', () => {
    expect(getDocumentTitle('ja', 'options')).toBe('オプション - TABBIN')
    expect(getDocumentTitle('en', 'changelog')).toBe('Release Notes - TABBIN')
  })

  it('system 設定時は UI locale から document title を解決する', () => {
    expect(resolveDocumentTitle('system', 'ja-JP', 'savedTabs')).toBe(
      '保存したタブ - TABBIN',
    )
    expect(resolveDocumentTitle('system', 'en-US', 'savedTabs')).toBe(
      'Saved tabs - TABBIN',
    )
  })

  it('pathname から document title のページキーを解決する', () => {
    expect(resolveTitlePageKeyFromPathname('/')).toBe('app')
    expect(resolveTitlePageKeyFromPathname('/options.html')).toBe('options')
    expect(resolveTitlePageKeyFromPathname('/options')).toBe('options')
    expect(resolveTitlePageKeyFromPathname('/saved-tabs')).toBe('savedTabs')
    expect(resolveTitlePageKeyFromPathname('/analytics')).toBe('analytics')
    expect(resolveTitlePageKeyFromPathname('/changelog.html')).toBe('changelog')
    expect(resolveTitlePageKeyFromPathname('/periodic-execution')).toBe(
      'periodicExecution',
    )
  })

  it('pathname から document title を直接解決する', () => {
    expect(
      resolveDocumentTitleFromPathname('/ai-chat.html', 'system', 'en-US'),
    ).toBe('AI Chat - TABBIN')
    expect(
      resolveDocumentTitleFromPathname('/saved-tabs.html', 'system', 'ja-JP'),
    ).toBe('保存したタブ - TABBIN')
  })
})
