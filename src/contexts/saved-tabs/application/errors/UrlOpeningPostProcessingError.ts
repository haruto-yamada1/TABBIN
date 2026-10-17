import type { OpenedUrlsDto } from '@/contexts/saved-tabs/application/dto/OpenedUrlsDto'

/** Opening was confirmed before saved-data updates failed. */
export class UrlOpeningPostProcessingError extends Error {
  readonly openedUrls: readonly string[]
  readonly failedUrls: OpenedUrlsDto['failedUrls']

  constructor(
    openedUrls: readonly string[],
    failedUrls: OpenedUrlsDto['failedUrls'] = [],
  ) {
    super('URL opening succeeded, but updating saved URLs failed.')
    this.name = 'UrlOpeningPostProcessingError'
    this.openedUrls = [...openedUrls]
    this.failedUrls = [...failedUrls]
  }
}
