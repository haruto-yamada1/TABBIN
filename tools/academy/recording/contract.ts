export type RecordingSource = 'chrome-web-store' | 'unpacked-development'

export type RecordedTab = {
  id: number
  url: string
  active: boolean
}

export type SaveFlowEvidence = {
  source: RecordingSource
  extensionId: string
  expectedUrls: readonly string[]
  beforeTabs: readonly RecordedTab[]
  afterTabs: readonly RecordedTab[]
  isOnToolbar: boolean
  clickBehavior: string
  snapshot: {
    urls: readonly { id: string; url: string }[]
    collections: readonly {
      id: string
      definition: { type: string; domain?: string }
    }[]
    memberships: readonly { collectionId: string; urlId: string }[]
  }
}

const inspectFixture = (expectedUrls: readonly string[]) => {
  const errors: string[] = []
  const expected = new Set(expectedUrls)
  const expectedHosts = new Set<string>()
  let validUrls = expected.size === expectedUrls.length && expected.size >= 2
  for (const url of expectedUrls) {
    const parsed = URL.parse(url)
    if (!parsed || !['http:', 'https:'].includes(parsed.protocol)) {
      validUrls = false
    } else {
      expectedHosts.add(parsed.hostname)
    }
  }
  if (!validUrls) {
    errors.push('fixture-urls')
  }
  if (expectedHosts.size < 2) {
    errors.push('fixture-hostnames')
  }
  return { errors, expected, expectedHosts }
}

const validBeforeTabs = (
  tabs: readonly RecordedTab[],
  expected: ReadonlySet<string>,
) =>
  tabs.length === expected.size &&
  new Set(tabs.map((tab) => tab.id)).size === tabs.length &&
  new Set(tabs.map((tab) => tab.url)).size === expected.size &&
  tabs.every(
    (tab) => Number.isInteger(tab.id) && tab.id >= 0 && expected.has(tab.url),
  )

const validAfterTab = (evidence: SaveFlowEvidence) => {
  const [remaining] = evidence.afterTabs
  const expectedAppUrl = `chrome-extension://${evidence.extensionId}/app.html#/saved-tabs?mode=domain`
  return (
    evidence.afterTabs.length === 1 &&
    remaining?.active === true &&
    remaining.url === expectedAppUrl
  )
}

const validSavedUrls = (
  snapshot: SaveFlowEvidence['snapshot'],
  expected: ReadonlySet<string>,
) =>
  snapshot.urls.length === expected.size &&
  new Set(snapshot.urls.map((item) => item.id)).size === snapshot.urls.length &&
  new Set(snapshot.urls.map((item) => item.url)).size === expected.size &&
  snapshot.urls.every((item) => expected.has(item.url))

const validDomainCollections = (
  snapshot: SaveFlowEvidence['snapshot'],
  expectedHosts: ReadonlySet<string>,
) => {
  const domains = snapshot.collections.filter(
    (collection) => collection.definition.type === 'domain',
  )
  return (
    domains.length === expectedHosts.size &&
    new Set(domains.map((item) => item.definition.domain)).size ===
      expectedHosts.size &&
    new Set(snapshot.collections.map((item) => item.id)).size ===
      snapshot.collections.length &&
    domains.every((item) => expectedHosts.has(item.definition.domain ?? ''))
  )
}

const validDomainMemberships = (
  snapshot: SaveFlowEvidence['snapshot'],
  expected: ReadonlySet<string>,
) => {
  const savedIds = new Set(snapshot.urls.map((item) => item.id))
  const collectionsById = new Map(
    snapshot.collections.map((collection) => [collection.id, collection]),
  )
  const domainMemberships = snapshot.memberships.filter(
    (membership) =>
      collectionsById.get(membership.collectionId)?.definition.type ===
      'domain',
  )
  return (
    snapshot.memberships.every(
      (membership) =>
        collectionsById.has(membership.collectionId) &&
        savedIds.has(membership.urlId),
    ) &&
    domainMemberships.length === expected.size &&
    snapshot.urls.every((item) => {
      const memberships = domainMemberships.filter(
        (membership) => membership.urlId === item.id,
      )
      const [membership] = memberships
      return (
        memberships.length === 1 &&
        membership !== undefined &&
        collectionsById.get(membership.collectionId)?.definition.domain ===
          URL.parse(item.url)?.hostname
      )
    })
  )
}

export const validateSaveFlow = (
  evidence: SaveFlowEvidence,
): { status: 'passed' | 'failed'; errors: string[] } => {
  const { errors, expected, expectedHosts } = inspectFixture(
    evidence.expectedUrls,
  )
  const beforeIds = new Set(evidence.beforeTabs.map((tab) => tab.id))
  const checks = [
    [
      ['chrome-web-store', 'unpacked-development'].includes(evidence.source),
      'installation-source',
    ],
    [evidence.isOnToolbar, 'toolbar-not-pinned'],
    [evidence.clickBehavior === 'saveWindowTabs', 'click-behavior-not-window'],
    [validBeforeTabs(evidence.beforeTabs, expected), 'before-tabs'],
    [
      evidence.afterTabs.every((tab) => !beforeIds.has(tab.id)),
      'fixture-tabs-still-open',
    ],
    [validAfterTab(evidence), 'after-domain-tab'],
    [validSavedUrls(evidence.snapshot, expected), 'saved-urls'],
    [
      validDomainCollections(evidence.snapshot, expectedHosts),
      'domain-collections',
    ],
    [validDomainMemberships(evidence.snapshot, expected), 'domain-memberships'],
  ] satisfies [boolean, string][]
  for (const [passed, error] of checks) {
    if (!passed) {
      errors.push(error)
    }
  }
  return { status: errors.length === 0 ? 'passed' : 'failed', errors }
}
