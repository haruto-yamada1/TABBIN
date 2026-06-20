export const getChangelogFeatureClassName = (highlight?: boolean): string =>
  `ml-4 text-base ${highlight ? 'font-medium text-primary' : 'text-foreground'}`
