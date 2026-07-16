'use client'

import { CheckIcon, CopyIcon } from 'lucide-react'
import type { CSSProperties, ComponentProps, HTMLAttributes } from 'react'
import {
  createContext,
  memo,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type {
  HighlighterCore,
  LanguageRegistration,
  ThemedToken,
  ThemeRegistration,
} from 'shiki/core'
import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

import { useCopyState } from './use-copy-state'

// Shiki uses bitflags for font styles: 1=italic, 2=bold, 4=underline
const FONT_STYLE_UNDERLINE = 4
const isItalic = (fontStyle: number | undefined) => fontStyle && fontStyle & 1
const isBold = (fontStyle: number | undefined) => fontStyle && fontStyle & 2
const isUnderline = (fontStyle: number | undefined) =>
  fontStyle && fontStyle & FONT_STYLE_UNDERLINE

// Transform tokens to include pre-computed keys to avoid noArrayIndexKey lint
type KeyedToken = {
  token: ThemedToken
  key: string
}
type KeyedLine = {
  tokens: KeyedToken[]
  key: string
}

const addKeysToTokens = (lines: ThemedToken[][]): KeyedLine[] =>
  lines.map((line, lineIdx) => ({
    key: `line-${lineIdx}`,
    tokens: line.map((token, tokenIdx) => ({
      key: `line-${lineIdx}-${tokenIdx}`,
      token,
    })),
  }))

// Token rendering component
const TokenSpan = ({ token }: { token: ThemedToken }) => {
  const tokenStyle: CSSProperties = {
    backgroundColor: token.bgColor,
    color: token.color,
    fontStyle: isItalic(token.fontStyle) ? 'italic' : undefined,
    fontWeight: isBold(token.fontStyle) ? 'bold' : undefined,
    textDecoration: isUnderline(token.fontStyle) ? 'underline' : undefined,
    ...token.htmlStyle,
  }

  return (
    <span
      className='dark:bg-(--shiki-dark-bg)! dark:text-(--shiki-dark)!'
      style={tokenStyle}
    >
      {token.content}
    </span>
  )
}

// Line rendering component
const LineSpan = ({
  keyedLine,
  showLineNumbers,
}: {
  keyedLine: KeyedLine
  showLineNumbers: boolean
}) => (
  <span className={showLineNumbers ? LINE_NUMBER_CLASSES : 'block'}>
    {keyedLine.tokens.length === 0
      ? '\n'
      : keyedLine.tokens.map(({ token, key }) => (
          <TokenSpan key={key} token={token} />
        ))}
  </span>
)

// Types
type CodeBlockProps = HTMLAttributes<HTMLDivElement> & {
  code: string
  language: string
  showLineNumbers?: boolean
  wrapLongLines?: boolean
}

type SupportedCodeLanguage =
  | 'bash'
  | 'css'
  | 'diff'
  | 'html'
  | 'javascript'
  | 'json'
  | 'jsx'
  | 'markdown'
  | 'python'
  | 'text'
  | 'tsx'
  | 'typescript'
  | 'yaml'

type HighlightLanguage = Exclude<SupportedCodeLanguage, 'text'>

type TokenizedCode = {
  tokens: ThemedToken[][]
  fg: string
  bg: string
}

type CodeBlockContextType = {
  code: string
}

// Context
const CodeBlockContext = createContext<CodeBlockContextType>({
  code: '',
})

// Highlighter cache (singleton per language)
const highlighterCache = new Map<string, Promise<HighlighterCore>>()

// Token cache
const tokensCache = new Map<string, TokenizedCode>()

// Subscribers for async token updates
const subscribers = new Map<string, Set<(result: TokenizedCode) => void>>()

const codeLanguageAliases: Record<string, SupportedCodeLanguage> = {
  bash: 'bash',
  css: 'css',
  diff: 'diff',
  html: 'html',
  javascript: 'javascript',
  js: 'javascript',
  json: 'json',
  jsx: 'jsx',
  markdown: 'markdown',
  md: 'markdown',
  mjs: 'javascript',
  py: 'python',
  python: 'python',
  sh: 'bash',
  shell: 'bash',
  shellscript: 'bash',
  text: 'text',
  ts: 'typescript',
  tsx: 'tsx',
  typescript: 'typescript',
  yml: 'yaml',
  yaml: 'yaml',
  zsh: 'bash',
}
export const getSupportedCodeLanguage = (
  language: string,
): SupportedCodeLanguage => {
  const normalizedLanguage = language.trim().toLowerCase()
  return codeLanguageAliases[normalizedLanguage] ?? 'text'
}

const languageLoaders: Record<
  HighlightLanguage,
  () => Promise<LanguageRegistration[]>
> = {
  bash: async () => (await import('shiki/langs/bash.mjs')).default,
  css: async () => (await import('shiki/langs/css.mjs')).default,
  diff: async () => (await import('shiki/langs/diff.mjs')).default,
  html: async () => (await import('shiki/langs/html.mjs')).default,
  javascript: async () => (await import('shiki/langs/javascript.mjs')).default,
  json: async () => (await import('shiki/langs/json.mjs')).default,
  jsx: async () => (await import('shiki/langs/jsx.mjs')).default,
  markdown: async () => (await import('shiki/langs/markdown.mjs')).default,
  python: async () => (await import('shiki/langs/python.mjs')).default,
  tsx: async () => (await import('shiki/langs/tsx.mjs')).default,
  typescript: async () => (await import('shiki/langs/typescript.mjs')).default,
  yaml: async () => (await import('shiki/langs/yaml.mjs')).default,
}

let themesPromise: Promise<ThemeRegistration[]> | null = null

const loadThemes = async () => {
  themesPromise ??= Promise.all([
    import('shiki/themes/github-light.mjs'),
    import('shiki/themes/github-dark.mjs'),
  ]).then(([githubLight, githubDark]) => [
    githubLight.default,
    githubDark.default,
  ])

  return themesPromise
}

const CACHE_KEY_LENGTH = 100

const getTokensCacheKey = (code: string, language: SupportedCodeLanguage) => {
  const start = code.slice(0, CACHE_KEY_LENGTH)
  const end =
    code.length > CACHE_KEY_LENGTH ? code.slice(-CACHE_KEY_LENGTH) : ''
  return `${language}:${code.length}:${start}:${end}`
}

const getHighlighter = async (
  language: HighlightLanguage,
): Promise<HighlighterCore> => {
  const cached = highlighterCache.get(language)
  if (cached) {
    return cached
  }

  const highlighterPromise = Promise.all([
    languageLoaders[language](),
    loadThemes(),
  ]).then(async ([langs, themes]) =>
    createHighlighterCore({
      engine: createJavaScriptRegexEngine({ forgiving: true }),
      langs,
      themes,
    }),
  )

  highlighterCache.set(language, highlighterPromise)
  return highlighterPromise
}

// Create raw tokens for immediate display while highlighting loads
const createRawTokens = (code: string): TokenizedCode => ({
  bg: 'transparent',
  fg: 'inherit',
  tokens: code.split('\n').map((line): ThemedToken[] =>
    line === ''
      ? []
      : [
          {
            color: 'inherit',
            content: line,
            offset: 0,
          },
        ],
  ),
})
// Synchronous highlight with callback for async results
export const highlightCode = (
  code: string,
  language: string,
  callback?: (result: TokenizedCode) => void,
): TokenizedCode | null => {
  const supportedLanguage = getSupportedCodeLanguage(language)
  if (supportedLanguage === 'text') {
    return createRawTokens(code)
  }

  const tokensCacheKey = getTokensCacheKey(code, supportedLanguage)

  // Return cached result if available
  const cached = tokensCache.get(tokensCacheKey)
  if (cached) {
    return cached
  }

  // Subscribe callback if provided
  if (callback) {
    if (!subscribers.has(tokensCacheKey)) {
      subscribers.set(tokensCacheKey, new Set())
    }
    subscribers.get(tokensCacheKey)?.add(callback)
  }

  // Start highlighting in background - fire-and-forget async pattern
  getHighlighter(supportedLanguage)
    .then((highlighter) => {
      const availableLangs = highlighter.getLoadedLanguages()
      const langToUse = availableLangs.includes(supportedLanguage)
        ? supportedLanguage
        : 'text'

      const result = highlighter.codeToTokens(code, {
        lang: langToUse,
        themes: {
          dark: 'github-dark',
          light: 'github-light',
        },
      })

      const tokenized: TokenizedCode = {
        bg: result.bg ?? 'transparent',
        fg: result.fg ?? 'inherit',
        tokens: result.tokens,
      }

      // Cache the result
      tokensCache.set(tokensCacheKey, tokenized)

      // Notify all subscribers
      const subs = subscribers.get(tokensCacheKey)
      if (subs) {
        for (const sub of subs) {
          sub(tokenized)
        }
        subscribers.delete(tokensCacheKey)
      }
    })
    .catch((error: unknown) => {
      console.error('Failed to highlight code:', error)
      subscribers.delete(tokensCacheKey)
    })

  return null
}

// Line number styles using CSS counters
const LINE_NUMBER_CLASSES = cn(
  'block',
  'before:content-[counter(line)]',
  'before:inline-block',
  'before:[counter-increment:line]',
  'before:w-8',
  'before:mr-4',
  'before:text-right',
  'before:text-muted-foreground/50',
  'before:font-mono',
  'before:select-none',
)

const CodeBlockBody = memo(
  ({
    tokenized,
    showLineNumbers,
    wrapLongLines,
    className,
  }: {
    tokenized: TokenizedCode
    showLineNumbers: boolean
    wrapLongLines: boolean
    className?: string
  }) => {
    const preStyle = useMemo(
      () => ({
        backgroundColor: tokenized.bg,
        color: tokenized.fg,
      }),
      [tokenized.bg, tokenized.fg],
    )

    const keyedLines = useMemo(
      () => addKeysToTokens(tokenized.tokens),
      [tokenized.tokens],
    )

    return (
      <pre
        className={cn(
          'm-0 p-4 text-sm dark:bg-(--shiki-dark-bg)! dark:text-(--shiki-dark)!',
          wrapLongLines && 'break-words wrap-anywhere whitespace-pre-wrap',
          className,
        )}
        style={preStyle}
      >
        <code
          className={cn(
            'font-mono text-sm',
            showLineNumbers &&
              '[counter-increment:line_0] [counter-reset:line]',
          )}
        >
          {keyedLines.map((keyedLine) => (
            <LineSpan
              key={keyedLine.key}
              keyedLine={keyedLine}
              showLineNumbers={showLineNumbers}
            />
          ))}
        </code>
      </pre>
    )
  },
  (prevProps, nextProps) =>
    prevProps.tokenized === nextProps.tokenized &&
    prevProps.showLineNumbers === nextProps.showLineNumbers &&
    prevProps.className === nextProps.className,
)

CodeBlockBody.displayName = 'CodeBlockBody'

const CodeBlockContainer = ({
  className,
  language,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement> & { language: string }) => {
  const containerStyle: CSSProperties = {
    containIntrinsicSize: 'auto 200px',
    contentVisibility: 'auto',
    ...style,
  }

  return (
    <div
      className={cn(
        'group relative w-full overflow-hidden rounded-md border bg-background text-foreground',
        className,
      )}
      data-language={language}
      style={containerStyle}
      {...props}
    />
  )
}

export const CodeBlockHeader = ({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex items-center justify-between border-b bg-muted/80 px-3 py-2 text-xs text-muted-foreground',
      className,
    )}
    {...props}
  >
    {children}
  </div>
)

export const CodeBlockTitle = ({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex items-center gap-2', className)} {...props}>
    {children}
  </div>
)

export const CodeBlockFilename = ({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn('font-mono', className)} {...props}>
    {children}
  </span>
)

export const CodeBlockActions = ({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('-my-1 -mr-1 flex items-center gap-2', className)}
    {...props}
  >
    {children}
  </div>
)

const CodeBlockContent = ({
  code,
  language,
  showLineNumbers = false,
  wrapLongLines = false,
}: {
  code: string
  language: string
  showLineNumbers?: boolean
  wrapLongLines?: boolean
}) => {
  // Memoized raw tokens for immediate display
  const rawTokens = useMemo(() => createRawTokens(code), [code])

  // Try to get cached result synchronously, otherwise use raw tokens
  const [tokenized, setTokenized] = useState<TokenizedCode>(
    () => highlightCode(code, language) ?? rawTokens,
  )

  useEffect(() => {
    let cancelled = false

    // Reset to raw tokens when code changes (shows current code, not stale tokens)
    // eslint-disable-next-line react-hooks-compiler/set-state-in-effect -- vendored shiki highlighter resets cached tokens when code/language changes before subscribing to async highlight
    setTokenized(highlightCode(code, language) ?? rawTokens)

    // Subscribe to async highlighting result
    highlightCode(code, language, (result) => {
      if (!cancelled) {
        setTokenized(result)
      }
    })

    return () => {
      cancelled = true
    }
  }, [code, language, rawTokens])

  return (
    <div
      className={cn(
        'relative overflow-auto',
        wrapLongLines && 'overflow-x-hidden',
      )}
    >
      <CodeBlockBody
        showLineNumbers={showLineNumbers}
        tokenized={tokenized}
        wrapLongLines={wrapLongLines}
      />
    </div>
  )
}

export const CodeBlock = ({
  code,
  language,
  showLineNumbers = false,
  wrapLongLines = false,
  className,
  children,
  ...props
}: CodeBlockProps) => {
  const contextValue = useMemo(() => ({ code }), [code])

  return (
    <CodeBlockContext.Provider value={contextValue}>
      <CodeBlockContainer className={className} language={language} {...props}>
        {children}
        <CodeBlockContent
          code={code}
          language={language}
          showLineNumbers={showLineNumbers}
          wrapLongLines={wrapLongLines}
        />
      </CodeBlockContainer>
    </CodeBlockContext.Provider>
  )
}

export type CodeBlockCopyButtonProps = ComponentProps<typeof Button> & {
  onCopy?: () => void
  onError?: (error: Error) => void
  timeout?: number
}

export const CodeBlockCopyButton = ({
  onCopy,
  onError,
  timeout = 2000,
  children,
  className,
  ...props
}: CodeBlockCopyButtonProps) => {
  const { code } = use(CodeBlockContext)
  const { copyText, isCopied } = useCopyState({ onCopy, onError, timeout })

  const handleCopy = useCallback(() => {
    void copyText(code, { skipIfCopied: true })
  }, [code, copyText])

  const Icon = isCopied ? CheckIcon : CopyIcon

  return (
    <Button
      className={cn('shrink-0', className)}
      onClick={handleCopy}
      size='icon'
      variant='ghost'
      {...props}
    >
      {children ?? <Icon size={14} />}
    </Button>
  )
}

export type CodeBlockLanguageSelectorProps = ComponentProps<typeof Select>

export const CodeBlockLanguageSelector = (
  props: CodeBlockLanguageSelectorProps,
) => <Select {...props} />

export type CodeBlockLanguageSelectorTriggerProps = ComponentProps<
  typeof SelectTrigger
>

export const CodeBlockLanguageSelectorTrigger = ({
  className,
  ...props
}: CodeBlockLanguageSelectorTriggerProps) => (
  <SelectTrigger
    className={cn(
      'h-7 border-none bg-transparent px-2 text-xs shadow-none',
      className,
    )}
    {...props}
  />
)

export type CodeBlockLanguageSelectorValueProps = ComponentProps<
  typeof SelectValue
>

export const CodeBlockLanguageSelectorValue = (
  props: CodeBlockLanguageSelectorValueProps,
) => <SelectValue {...props} />

export type CodeBlockLanguageSelectorContentProps = ComponentProps<
  typeof SelectContent
>

export const CodeBlockLanguageSelectorContent = ({
  align = 'end',
  ...props
}: CodeBlockLanguageSelectorContentProps) => (
  <SelectContent align={align} {...props} />
)

export type CodeBlockLanguageSelectorItemProps = ComponentProps<
  typeof SelectItem
>

export const CodeBlockLanguageSelectorItem = (
  props: CodeBlockLanguageSelectorItemProps,
) => <SelectItem {...props} />
