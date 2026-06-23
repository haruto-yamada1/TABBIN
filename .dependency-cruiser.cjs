/// <reference types="node" />
const fs = process.getBuiltinModule('node:fs')
const path = process.getBuiltinModule('node:path')

const contextsDirectory = path.join(__dirname, 'src', 'contexts')

/** @param {string} value */
const escapeRegExp = (value) =>
  value.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`)

// UI / routing / notification / animation 系 npm package。
// domain / application 層はこれら UI 実装詳細に依存してはならない
// (issue #574)。infrastructure 層の adapter は許可する。
const uiPackagesPattern =
  '(^|/)node_modules/(react|react-dom|react-router-dom|sonner|lucide-react|@radix-ui|@dnd-kit|motion)(/|$)'

const getContextNames = () => {
  if (!fs.existsSync(contextsDirectory)) {
    return []
  }

  return fs
    .readdirSync(contextsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
}

// ──────────────────────────────────────────────────────────────────────
// Cross-context import policy (issue #585)
//
// A context may depend on another context ONLY through that context's
// public API file: src/contexts/{context-name}/public-api.ts
//
// Internal files (domain, application, infrastructure, presentation,
// testing, etc.) of another context must NOT be imported directly.
//
// src/contexts/shared/ is a shared kernel. Any context may import from
// it freely — no public-api.ts restriction applies.
// ──────────────────────────────────────────────────────────────────────
const noCrossContextRules = getContextNames().map((contextName) => {
  const escapedContextName = escapeRegExp(contextName)

  return {
    name: `no-${contextName}-to-other-context-internal`,
    comment: `${contextName} context must depend on another context only through its public-api.ts`,
    severity: 'error',
    from: {
      path: `^src/contexts/${escapedContextName}/`,
    },
    to: {
      path: `^src/contexts/(?!${escapedContextName}/)[^/]+/`,
      pathNot: [
        // shared kernel — freely importable by any context
        '^src/contexts/shared/',
        // public API entry point — the only allowed cross-context surface
        String.raw`^src/contexts/[^/]+/public-api\.ts$`,
      ],
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
      name: 'no-domain-to-ui-packages',
      comment:
        'Domain code must not depend on UI, routing, notification, or animation packages',
      severity: 'error',
      from: { path: '^src/contexts/[^/]+/domain/' },
      to: { path: uiPackagesPattern },
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
      name: 'no-application-to-presentation',
      comment: 'Application code must not depend on presentation',
      severity: 'error',
      from: { path: '^src/contexts/[^/]+/application/' },
      to: {
        path: '^src/contexts/[^/]+/presentation/',
      },
    },
    {
      name: 'no-application-to-ui-packages',
      comment:
        'Application code must not depend on UI, routing, notification, or animation packages',
      severity: 'error',
      from: { path: '^src/contexts/[^/]+/application/' },
      to: { path: uiPackagesPattern },
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
      name: 'no-presentation-to-domain',
      comment:
        'Presentation code must use application DTOs/view-models instead of domain entities',
      severity: 'error',
      from: { path: '^src/contexts/[^/]+/presentation/' },
      to: { path: '^src/contexts/[^/]+/domain/' },
    },
    {
      name: 'no-infrastructure-construction-outside-composition',
      comment:
        'Infrastructure implementations must be wired only from composition, entrypoints, or infrastructure itself',
      severity: 'error',
      from: {
        path: '^src/(?!app/composition/|entrypoints/|contexts/[^/]+/infrastructure/)',
      },
      to: {
        path: '^src/contexts/[^/]+/infrastructure/',
      },
    },
    {
      name: 'no-legacy-features-to-context-internals',
      comment:
        'Legacy feature code must not depend on context internals (domain, application, infrastructure). Use the context public API (public-api.ts), a facade, or a presentation entry point instead. See issue #588.',
      severity: 'error',
      from: {
        path: '^src/features/',
      },
      to: {
        path: '^src/contexts/[^/]+/(domain|application|infrastructure)/',
      },
    },
    {
      name: 'no-presentation-tests-to-domain',
      comment:
        'Presentation tests must use application DTO fixtures instead of domain entities',
      severity: 'error',
      from: {
        path: '^src/contexts/[^/]+/presentation/.*\\.(test|spec)\\.(ts|tsx)$',
      },
      to: { path: '^src/contexts/[^/]+/domain/' },
    },
    ...noCrossContextRules,
  ],
  options: {
    builtInModules: { add: ['chrome'] },
    doNotFollow: { path: 'node_modules' },
    parser: 'swc',
    tsPreCompilationDeps: true,
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
