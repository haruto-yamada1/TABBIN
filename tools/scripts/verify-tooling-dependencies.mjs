await import('@tabbin/legacy-tooling/eslint-react')
await import('@secretlint/secretlint-rule-preset-recommend')

const { parseSync } = await import('@swc/core')
parseSync('export type ToolingDependencyProbe = string', {
  syntax: 'typescript',
})
