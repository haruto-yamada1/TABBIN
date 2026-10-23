/** Protocol-independent JS request boundary; extension resources lack Resource Timing. */
export class InitialLoadTracker {
  private readonly origin: URL
  private readonly pending = new Set<string>()
  private readonly files = new Set<string>()
  private settledAt = Date.now()
  private failure: string | undefined

  constructor(origin: string) {
    this.origin = new URL(origin)
  }

  started(id: string, source: string): void {
    const url = new URL(source)
    if (
      url.protocol !== this.origin.protocol ||
      url.host !== this.origin.host ||
      !url.pathname.endsWith('.js')
    ) {
      return
    }
    this.pending.add(id)

    this.settledAt = Date.now()
  }

  parsed(source: string): void {
    if (!source) {
      return
    }
    const url = new URL(source)
    if (
      url.protocol === this.origin.protocol &&
      url.host === this.origin.host &&
      url.pathname.endsWith('.js')
    ) {
      this.files.add(decodeURIComponent(url.pathname.slice(1)))
      this.settledAt = Date.now()
    }
  }

  finished(id: string): void {
    if (this.pending.delete(id)) {
      this.settledAt = Date.now()
    }
  }

  failed(id: string): void {
    if (this.pending.has(id)) {
      this.failure = 'Initial JavaScript request failed'
    }
  }

  snapshot(ready: boolean): string[] | null {
    if (this.failure) {
      throw new Error(this.failure)
    }
    if (
      !ready ||
      !this.files.size ||
      this.pending.size ||
      Date.now() - this.settledAt < 500
    ) {
      return null
    }
    return [...this.files].toSorted()
  }
}
