const fs = process.getBuiltinModule('node:fs')
const path = process.getBuiltinModule('node:path')

const contextsDirectory = path.join(__dirname, 'src', 'contexts')

/** @param {string} value */
const escapeRegExp = (value) =>
  value.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`)

const getContextNames = () => {
  if (!fs.existsSync(contextsDirectory)) {
    return []
  }

  return fs
    .readdirSync(contextsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
}

const noCrossContextRules = getContextNames().map((contextName) => {
  const escapedContextName = escapeRegExp(contextName)

  return {
    name: `no-${contextName}-to-other-context`,
    comment: `${contextName} context must not directly depend on another context`,
    severity: 'error',
    from: {
      path: `^src/contexts/${escapedContextName}/`,
    },
    to: {
      path: `^src/contexts/(?!${escapedContextName}/)[^/]+/`,
      pathNot: ['^src/contexts/shared/'],
    },
  }
})

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment: 'Circular dependencies are not allowed',
      severity: 'error',
      from: { path: '^src/' },
      to: { circular: true },
    },
    {
      name: 'no-unresolvable',
      comment: 'Imports must resolve to an existing dependency',
      severity: 'error',
      from: { path: '^src/' },
      to: { couldNotResolve: true },
    },
    {
      name: 'no-domain-to-react',
      comment: 'Domain code must not depend on React',
      severity: 'error',
      from: { path: '^src/contexts/[^/]+/domain/' },
      to: { path: '(^|/)node_modules/(react|react-dom)/' },
    },
    {
      name: 'no-domain-to-ui',
      comment: 'Domain code must not depend on UI or presentation code',
      severity: 'error',
      from: { path: '^src/contexts/[^/]+/domain/' },
      to: {
        path: '^src/components/|^src/features/[^/]+/components/|^src/contexts/[^/]+/presentation/',
      },
    },
    {
      name: 'no-domain-to-storage-types',
      comment:
        'Domain code must use domain DTOs instead of shared storage types',
      severity: 'error',
      from: { path: '^src/contexts/[^/]+/domain/' },
      to: { path: '^src/types/storage(?:/|\\.)' },
    },
    {
      name: 'no-domain-to-outer-layer',
      comment: 'Domain code must not depend on an outer context layer',
      severity: 'error',
      from: { path: '^src/contexts/[^/]+/domain/' },
      to: {
        path: '^src/contexts/[^/]+/(application|infrastructure|presentation)/',
      },
    },
    {
      name: 'no-application-to-infrastructure-or-presentation',
      comment:
        'Application code must not depend on infrastructure or presentation',
      severity: 'error',
      from: { path: '^src/contexts/[^/]+/application/' },
      to: {
        path: '^src/contexts/[^/]+/(infrastructure|presentation)/',
      },
    },
    {
      name: 'no-application-to-react',
      comment: 'Application code must not depend on React',
      severity: 'error',
      from: { path: '^src/contexts/[^/]+/application/' },
      to: { path: '(^|/)node_modules/(react|react-dom)/' },
    },
    {
      name: 'no-application-to-ui',
      comment: 'Application code must not depend on UI components',
      severity: 'error',
      from: { path: '^src/contexts/[^/]+/application/' },
      to: {
        path: '^src/components/|^src/features/[^/]+/components/',
      },
    },
    {
      name: 'no-infrastructure-to-presentation',
      comment: 'Infrastructure code must not depend on presentation code',
      severity: 'error',
      from: { path: '^src/contexts/[^/]+/infrastructure/' },
      to: { path: '^src/contexts/[^/]+/presentation/' },
    },
    {
      name: 'no-infrastructure-to-react',
      comment: 'Infrastructure code must not depend on React',
      severity: 'error',
      from: { path: '^src/contexts/[^/]+/infrastructure/' },
      to: { path: '(^|/)node_modules/(react|react-dom)/' },
    },
    {
      name: 'no-infrastructure-to-ui',
      comment: 'Infrastructure code must not depend on UI components',
      severity: 'error',
      from: { path: '^src/contexts/[^/]+/infrastructure/' },
      to: {
        path: '^src/components/|^src/features/[^/]+/components/',
      },
    },
    {
      name: 'no-presentation-to-infrastructure',
      comment:
        'Presentation code must use infrastructure through application ports',
      severity: 'error',
      from: { path: '^src/contexts/[^/]+/presentation/' },
      to: { path: '^src/contexts/[^/]+/infrastructure/' },
    },
    ...noCrossContextRules,
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    parser: 'swc',
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    },
    reporterOptions: {
      dot: { collapsePattern: 'node_modules/[^/]+' },
    },
  },
}
