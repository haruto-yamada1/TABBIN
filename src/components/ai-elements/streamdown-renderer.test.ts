import { describe, expect, it } from 'vitest' // eslint-disable-line

import { hasMermaidBlock } from './streamdown-renderer'

describe('hasMermaidBlock', () => {
  it('mermaid fence がある Markdown だけを検出する', () => {
    expect(
      hasMermaidBlock(['```mermaid', 'graph LR', 'A --> B', '```'].join('\n')),
    ).toBe(true)
    expect(
      hasMermaidBlock(['```mmd', 'graph LR', 'A --> B', '```'].join('\n')),
    ).toBe(true)
    expect(
      hasMermaidBlock(['```typescript', 'const value = 1', '```'].join('\n')),
    ).toBe(false)
  })
})
