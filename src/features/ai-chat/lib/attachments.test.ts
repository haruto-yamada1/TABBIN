import type { FileUIPart } from 'ai'
import { afterEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import {
  buildTextAttachmentContext,
  convertPromptInputFilesToAiChatAttachments,
} from './attachments'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('convertPromptInputFilesToAiChatAttachments', () => {
  it('text の data URL をテキスト添付へ変換する', async () => {
    const files: FileUIPart[] = [
      {
        filename: 'memo.txt',
        mediaType: 'text/plain',
        type: 'file',
        url: 'data:text/plain;base64,44GT44KT44Gr44Gh44Gv',
      },
    ]

    await expect(
      convertPromptInputFilesToAiChatAttachments(files),
    ).resolves.toStrictEqual([
      {
        content: 'こんにちは',
        filename: 'memo.txt',
        kind: 'text',
        mediaType: 'text/plain',
      },
    ])
  })

  it('image の data URL は画像添付として保持する', async () => {
    const files: FileUIPart[] = [
      {
        filename: 'image.png',
        mediaType: 'image/png',
        type: 'file',
        url: 'data:image/png;base64,AAAA',
      },
    ]

    await expect(
      convertPromptInputFilesToAiChatAttachments(files),
    ).resolves.toStrictEqual([
      {
        content: 'data:image/png;base64,AAAA',
        filename: 'image.png',
        kind: 'image',
        mediaType: 'image/png',
      },
    ])
  })

  it('非対応の mediaType は例外にする', async () => {
    const files: FileUIPart[] = [
      {
        filename: 'archive.zip',
        mediaType: 'application/zip',
        type: 'file',
        url: 'data:application/zip;base64,AAAA',
      },
    ]

    await expect(
      convertPromptInputFilesToAiChatAttachments(files),
    ).rejects.toThrow('archive.zip')
  })

  it('base64 ではない text data URL もデコードする', async () => {
    const files: FileUIPart[] = [
      {
        filename: 'query.txt',
        mediaType: 'text/plain',
        type: 'file',
        url: 'data:text/plain,hello%20world',
      },
    ]

    await expect(
      convertPromptInputFilesToAiChatAttachments(files),
    ).resolves.toStrictEqual([
      {
        content: 'hello world',
        filename: 'query.txt',
        kind: 'text',
        mediaType: 'text/plain',
      },
    ])
  })

  it('不正な charset は utf-8 fallback で読む', async () => {
    const files: FileUIPart[] = [
      {
        filename: 'memo.txt',
        mediaType: 'text/plain',
        type: 'file',
        url: 'data:text/plain;charset=invalid-charset;base64,44GT44KT44Gr44Gh44Gv',
      },
    ]

    await expect(
      convertPromptInputFilesToAiChatAttachments(files),
    ).resolves.toStrictEqual([
      {
        content: 'こんにちは',
        filename: 'memo.txt',
        kind: 'text',
        mediaType: 'text/plain',
      },
    ])
  })

  it('不正な text URL は読み取りエラーにする', async () => {
    const files: FileUIPart[] = [
      {
        filename: 'memo.txt',
        mediaType: 'text/plain',
        type: 'file',
        url: 'blob:not-supported-here',
      },
    ]

    await expect(
      convertPromptInputFilesToAiChatAttachments(files),
    ).rejects.toThrow('添付ファイルを読み取れませんでした。')
  })

  it('atob が無い環境では Buffer fallback で base64 を読む', async () => {
    vi.stubGlobal('atob', undefined)

    const files: FileUIPart[] = [
      {
        filename: 'memo.txt',
        mediaType: 'text/plain',
        type: 'file',
        url: 'data:text/plain;base64,SGVsbG8=',
      },
    ]

    await expect(
      convertPromptInputFilesToAiChatAttachments(files),
    ).resolves.toStrictEqual([
      {
        content: 'Hello',
        filename: 'memo.txt',
        kind: 'text',
        mediaType: 'text/plain',
      },
    ])
  })

  it('data URL に media type が無くてもデコードできる', async () => {
    const files: FileUIPart[] = [
      {
        filename: 'memo.txt',
        mediaType: 'text/plain',
        type: 'file',
        url: 'data:,plain%20text',
      },
    ]

    await expect(
      convertPromptInputFilesToAiChatAttachments(files),
    ).resolves.toStrictEqual([
      {
        content: 'plain text',
        filename: 'memo.txt',
        kind: 'text',
        mediaType: 'text/plain',
      },
    ])
  })

  it('空 filename と空 mediaType は fallback 名と default mediaType を使う', async () => {
    const files: FileUIPart[] = [
      {
        filename: '   ',
        mediaType: '',
        type: 'file',
        url: 'data:,plain%20text',
      },
    ]

    await expect(
      convertPromptInputFilesToAiChatAttachments(files),
    ).rejects.toThrow('attachment は現在の AI チャットで扱えません')
  })
})

describe('buildTextAttachmentContext', () => {
  it('テキスト添付だけを AI 用コンテキスト文字列にまとめる', () => {
    expect(
      buildTextAttachmentContext([
        {
          content: 'alpha',
          filename: 'a.txt',
          kind: 'text',
          mediaType: 'text/plain',
        },
        {
          content: 'data:image/png;base64,AAAA',
          filename: 'image.png',
          kind: 'image',
          mediaType: 'image/png',
        },
      ]),
    ).toContain('a.txt')
  })

  it('text 添付が無ければ空文字を返す', () => {
    expect(
      buildTextAttachmentContext([
        {
          content: 'data:image/png;base64,AAAA',
          filename: 'image.png',
          kind: 'image',
          mediaType: 'image/png',
        },
      ]),
    ).toBe('')
  })
})
