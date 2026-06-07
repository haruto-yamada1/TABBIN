import type {
  AiChartSpec,
  AiSavedUrlRecord,
  InterestEvidenceEntry,
  InterestInferenceResult,
} from '@/features/ai-chat/types'
import { getMessage } from '@/features/i18n/lib/language'
import type { AppLanguage } from '@/features/i18n/messages'

const TOP_INTERESTS_LIMIT = 3
const TENTATIVE_THRESHOLD = 3

const countValues = (values: string[]): InterestEvidenceEntry[] => {
  const counts = new Map<string, number>()

  for (const value of values) {
    if (!value) {
      continue
    }
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([value, count]) => ({
      count,
      value,
    }))
    .toSorted(
      (left, right) =>
        right.count - left.count || left.value.localeCompare(right.value),
    )
}

const createCategoryChartSeries = (language: AppLanguage) => [
  {
    colorToken: 'chart-1',
    dataKey: 'count',
    label: getMessage(language, 'aiChat.interests.savedCountLabel'),
  },
]

const createDomainChartSeries = (language: AppLanguage) => [
  {
    colorToken: 'chart-2',
    dataKey: 'count',
    label: getMessage(language, 'aiChat.interests.savedCountLabel'),
  },
]

const toChartData = (entries: InterestEvidenceEntry[]) =>
  entries.map((entry) => ({
    count: entry.count,
    label: entry.value,
  }))

const buildChartSpecs = ({
  language,
  topCategories,
  topDomains,
}: InterestInferenceResult['evidence'] & {
  language: AppLanguage
}): AiChartSpec[] => {
  const chartSpecs: AiChartSpec[] = []

  if (topCategories.length > 0) {
    const categoryData = toChartData(topCategories)

    chartSpecs.push({
      categoryKey: 'label',
      data: categoryData,
      description: getMessage(
        language,
        'aiChat.interests.categoryShareDescription',
      ),
      series: createCategoryChartSeries(language),
      title: getMessage(language, 'aiChat.interests.topCategoriesTitle'),
      type: 'pie',
      valueFormat: 'count',
    })
    chartSpecs.push({
      data: categoryData,
      description: getMessage(
        language,
        'aiChat.interests.categoryCountDescription',
      ),
      series: createCategoryChartSeries(language),
      title: getMessage(language, 'aiChat.interests.categoryCountTitle'),
      type: 'bar',
      valueFormat: 'count',
      xKey: 'label',
    })
  }

  if (topDomains.length > 0) {
    chartSpecs.push({
      data: toChartData(topDomains),
      description: getMessage(
        language,
        'aiChat.interests.domainCountDescription',
      ),
      series: createDomainChartSeries(language),
      title: getMessage(language, 'aiChat.interests.topDomainsTitle'),
      type: 'bar',
      valueFormat: 'count',
      xKey: 'label',
    })
  }

  return chartSpecs
}

export const inferUserInterests = (
  records: AiSavedUrlRecord[],
  language: AppLanguage = 'ja',
): InterestInferenceResult => {
  const topDomains = countValues(records.map((record) => record.domain)).slice(
    0,
    TOP_INTERESTS_LIMIT,
  )
  const topCategories = countValues(
    records.flatMap((record) => [
      ...new Set([
        ...record.parentCategories,
        ...record.subCategories,
        ...record.projectCategories,
      ]),
    ]),
  ).slice(0, TOP_INTERESTS_LIMIT)
  const isTentative = records.length < TENTATIVE_THRESHOLD

  if (records.length === 0) {
    return {
      chartSpecs: [],
      evidence: {
        topCategories: [],
        topDomains: [],
      },
      isTentative: true,
      summary: getMessage(language, 'aiChat.interests.noDataSummary'),
    }
  }

  if (isTentative) {
    return {
      chartSpecs: buildChartSpecs({
        language,
        topDomains,
        topCategories,
      }),
      evidence: {
        topCategories,
        topDomains,
      },
      isTentative: true,
      summary: getMessage(language, 'aiChat.interests.tentativeSummary'),
    }
  }

  const domainSummary = topDomains
    .map((entry) => `${entry.value}(${entry.count})`)
    .join(' / ')
  const categorySummary =
    topCategories.length > 0
      ? getMessage(language, 'aiChat.interests.categoryBias', undefined, {
          categories: topCategories
            .map((entry) => entry.value)
            .join(language === 'ja' ? '、' : ', '),
        })
      : getMessage(language, 'aiChat.interests.categoryWeak')

  return {
    chartSpecs: buildChartSpecs({
      language,
      topDomains,
      topCategories,
    }),
    evidence: {
      topCategories,
      topDomains,
    },
    isTentative: false,
    summary: getMessage(language, 'aiChat.interests.summary', undefined, {
      categorySummary,
      domainSummary,
    }),
  }
}
