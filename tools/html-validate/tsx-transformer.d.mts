import type { Source } from 'html-validate'

declare const transformer: {
  (source: Source): Source[]
  api: number
}

// oxlint-disable-next-line import/no-default-export -- html-validate loads ESM transformers from default export.
export default transformer
