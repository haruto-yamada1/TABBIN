await import('@eslint-react/eslint-plugin')
await import('@secretlint/secretlint-rule-preset-recommend')

const { parseSync } = await import('@swc/core')
parseSync('export type ToolingDependencyProbe = string', {
  syntax: 'typescript',
})
