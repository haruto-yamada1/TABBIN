'use client'

import { cjk } from '@streamdown/cjk'
import type {
  CodeHighlighterPlugin,
  HighlightResult,
  ThemeInput,
} from '@streamdown/code'
import { math } from '@streamdown/math'
import { Suspense, lazy, memo } from 'react'
import type { ComponentProps } from 'react'
import { Streamdown } from 'streamdown'

import { getSupportedCodeLanguage, highlightCode } from './code-block'

export type StreamdownMarkdownProps = Omit<
  ComponentProps<typeof Streamdown>,
  'children'
> & {
  children: string
}

const streamdownCodePlugin: CodeHighlighterPlugin = {
  getSupportedLanguages: () =>
    [
      'bash',
      'css',
      'diff',
      'html',
      'javascript',
      'json',
      'jsx',
      'markdown',
      'python',
      'tsx',
      'typescript',
      'yaml',
    ] as ReturnType<CodeHighlighterPlugin['getSupportedLanguages']>,
  getThemes: () => ['github-light', 'github-dark'] as [ThemeInput, ThemeInput],
  highlight: ({ code, language }, callback) =>
    highlightCode(code, language, callback) as HighlightResult | null,
  name: 'shiki',
  supportsLanguage: (language) => getSupportedCodeLanguage(language) !== 'text',
  type: 'code-highlighter',
}

const baseStreamdownPlugins = { cjk, code: streamdownCodePlugin, math }
const mermaidFencePattern = /(^|\n)\s*```(?:mermaid|mmd)(?:\s|\n|$)/i

export const hasMermaidBlock = (markdown: string) =>
  mermaidFencePattern.test(markdown)

const MermaidStreamdown = lazy(async () => {
  const { mermaid } = await import('@streamdown/mermaid')
  const plugins = { ...baseStreamdownPlugins, mermaid }
  const MermaidStreamdownRenderer = (props: StreamdownMarkdownProps) => (
    <Streamdown plugins={plugins} {...props} />
  )

  return {
    default: MermaidStreamdownRenderer,
  }
})

export const StreamdownMarkdown = memo(
  ({ children, ...props }: StreamdownMarkdownProps) => {
    if (!hasMermaidBlock(children)) {
      return (
        <Streamdown plugins={baseStreamdownPlugins} {...props}>
          {children}
        </Streamdown>
      )
    }

    return (
      <Suspense
        fallback={
          <Streamdown plugins={baseStreamdownPlugins} {...props}>
            {children}
          </Streamdown>
        }
      >
        <MermaidStreamdown {...props}>{children}</MermaidStreamdown>
      </Suspense>
    )
  },
)

StreamdownMarkdown.displayName = 'StreamdownMarkdown'
