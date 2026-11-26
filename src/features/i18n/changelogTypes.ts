type ChangelogFeature = {
  text: string
  highlight?: boolean
}

type ChangelogItem = {
  version: string
  date: string
  features: ChangelogFeature[]
}

export type { ChangelogFeature, ChangelogItem }
