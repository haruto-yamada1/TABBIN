import type {
  SavedTabsAnalyticsRecord,
  SavedTabsInsightRecord,
} from '@/app/composition/backgroundSavedTabsDataPlaneTypes'

type HealthSourceRecord = SavedTabsInsightRecord &
  Partial<Pick<SavedTabsAnalyticsRecord, 'metric' | 'timestampAccuracy'>>

type HealthCategory = {
  kind: 'custom' | 'domain'
  label: string
  records: SavedTabsInsightRecord[]
}

type AnalyticsHealth = {
  records: SavedTabsInsightRecord[]
  categories: HealthCategory[]
  concentration: number
  duplicates: SavedTabsInsightRecord[]
  growingCategories: HealthCategory[]
  knownLastSaved: number
  score: number | null
  stale: SavedTabsInsightRecord[]
  total: number
  uncategorized: SavedTabsInsightRecord[]
  uncategorizedDomains: { label: string; records: SavedTabsInsightRecord[] }[]
}

const DAY_MS = 86_400_000
const STALE_DAYS = 90
const RECENT_DAYS = 7
const MAX_HEALTH_SCORE = 100
const UNCATEGORIZED_PENALTY = 40
const DUPLICATE_PENALTY = 40
const CONCENTRATION_PENALTY = 20
const CATEGORY_SUMMARY_LIMIT = 3
const HEALTH_LABEL_KEYS = [
  'parentCategories',
  'projectCategories',
  'savedInProjects',
  'savedInTabGroups',
  'subCategories',
] as const

// Event rows describe activity, not separate saved tabs. Classification lives
// on membership events; URL timestamp events deliberately have no labels.
const collectHealthUrls = (
  records: readonly HealthSourceRecord[],
  now: number,
) => {
  const urls = new Map<
    string,
    {
      record: SavedTabsInsightRecord
      labels: Record<
        | 'parentCategories'
        | 'projectCategories'
        | 'savedInProjects'
        | 'savedInTabGroups'
        | 'subCategories',
        Set<string>
      >
      firstSaved: number | undefined
      lastSaved: number | undefined
    }
  >()
  for (const record of records) {
    let item = urls.get(record.id)
    if (!item) {
      item = {
        record,
        labels: {
          parentCategories: new Set(),
          projectCategories: new Set(),
          savedInProjects: new Set(),
          savedInTabGroups: new Set(),
          subCategories: new Set(),
        },
        firstSaved: undefined,
        lastSaved: undefined,
      }
      urls.set(record.id, item)
    }
    for (const key of HEALTH_LABEL_KEYS) {
      for (const label of record[key]) {
        item.labels[key].add(label)
      }
    }
    if (
      record.timestampAccuracy !== 'exact' ||
      !Number.isFinite(record.savedAt) ||
      record.savedAt > now
    ) {
      continue
    }
    if (record.metric === 'first-saved') {
      item.firstSaved = record.savedAt
    }
    if (record.metric === 'last-saved') {
      item.lastSaved = Math.max(item.lastSaved ?? -Infinity, record.savedAt)
    }
  }
  return [...urls.values()].map((item) => ({
    firstSaved: item.firstSaved,
    lastSaved: item.lastSaved,
    record: {
      ...item.record,
      savedAt: item.lastSaved ?? item.record.savedAt,
      parentCategories: [...item.labels.parentCategories],
      projectCategories: [...item.labels.projectCategories],
      savedInProjects: [...item.labels.savedInProjects],
      savedInTabGroups: [...item.labels.savedInTabGroups],
      subCategories: [...item.labels.subCategories],
    },
  }))
}

const rankCategories = (categories: HealthCategory[]) =>
  categories.toSorted(
    (a, b) =>
      b.records.length - a.records.length ||
      a.label.localeCompare(b.label) ||
      a.kind.localeCompare(b.kind),
  )

const collectRecordCategories = (
  record: SavedTabsInsightRecord,
  firstSaved: number | undefined,
  now: number,
  collections: {
    categories: Map<string, HealthCategory>
    growingCategories: Map<string, HealthCategory>
  },
) => {
  const isRecent =
    firstSaved !== undefined && now - firstSaved <= RECENT_DAYS * DAY_MS
  for (const kind of ['domain', 'custom'] as const) {
    const labels =
      kind === 'domain' ? record.subCategories : record.projectCategories
    for (const label of labels) {
      const key = JSON.stringify([kind, label])
      const category = collections.categories.get(key) ?? {
        kind,
        label,
        records: [],
      }
      category.records.push(record)
      collections.categories.set(key, category)
      if (isRecent) {
        const recent = collections.growingCategories.get(key) ?? {
          kind,
          label,
          records: [],
        }
        recent.records.push(record)
        collections.growingCategories.set(key, recent)
      }
    }
  }
}

const calculateAnalyticsHealth = (
  records: readonly HealthSourceRecord[],
  now: number,
): AnalyticsHealth => {
  const urls = collectHealthUrls(records, now)
  const uncategorized: SavedTabsInsightRecord[] = []
  const duplicates: SavedTabsInsightRecord[] = []
  const stale: SavedTabsInsightRecord[] = []
  const seenUrls = new Set<string>()
  const categories = new Map<string, HealthCategory>()
  const growingCategories = new Map<string, HealthCategory>()
  const categoryCollections = { categories, growingCategories }
  const uncategorizedDomains = new Map<
    string,
    { label: string; records: SavedTabsInsightRecord[] }
  >()
  let knownLastSaved = 0
  for (const { record, firstSaved, lastSaved } of urls) {
    if (seenUrls.has(record.url)) {
      duplicates.push(record)
    }
    seenUrls.add(record.url)
    if (lastSaved !== undefined) {
      knownLastSaved += 1
      if (now - lastSaved >= STALE_DAYS * DAY_MS) {
        stale.push(record)
      }
    }
    if (
      record.subCategories.length === 0 &&
      record.projectCategories.length === 0
    ) {
      uncategorized.push(record)
      const group = uncategorizedDomains.get(record.domain) ?? {
        label: record.domain,
        records: [],
      }
      group.records.push(record)
      uncategorizedDomains.set(record.domain, group)
    }
    collectRecordCategories(record, firstSaved, now, categoryCollections)
  }
  const ranked = rankCategories([...categories.values()])
  const categorizedCount = urls.length - uncategorized.length
  const concentration =
    categorizedCount === 0
      ? 0
      : (ranked[0]?.records.length ?? 0) / categorizedCount
  const score =
    urls.length === 0
      ? null
      : Math.round(
          MAX_HEALTH_SCORE -
            (UNCATEGORIZED_PENALTY * uncategorized.length) / urls.length -
            (DUPLICATE_PENALTY * duplicates.length) / urls.length -
            CONCENTRATION_PENALTY * Math.max(0, 2 * concentration - 1),
        )
  return {
    records: urls.map((item) => item.record),
    categories: ranked,
    concentration,
    duplicates,
    growingCategories: rankCategories([...growingCategories.values()]).slice(
      0,
      CATEGORY_SUMMARY_LIMIT,
    ),
    knownLastSaved,
    score,
    stale,
    total: urls.length,
    uncategorized,
    uncategorizedDomains: [...uncategorizedDomains.values()]
      .toSorted(
        (a, b) =>
          b.records.length - a.records.length || a.label.localeCompare(b.label),
      )
      .slice(0, CATEGORY_SUMMARY_LIMIT),
  }
}

export { calculateAnalyticsHealth }
export type { AnalyticsHealth, HealthCategory }
