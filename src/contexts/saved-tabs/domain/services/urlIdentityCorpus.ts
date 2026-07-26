export type UrlIdentityDimension =
  | 'default-port'
  | 'extension-url'
  | 'file-url'
  | 'hash'
  | 'hostname-case'
  | 'identical'
  | 'international-domain'
  | 'localhost-loopback'
  | 'percent-encoding'
  | 'protocol'
  | 'query'
  | 'spa-route'
  | 'tracking-parameter'
  | 'trailing-slash'
  | 'www'

export type UrlIdentityCorpusEntry = {
  readonly dimension: UrlIdentityDimension
  readonly expectedSameIdentity: boolean
  readonly left: string
  readonly right: string
}

export const URL_IDENTITY_CORPUS = [
  {
    dimension: 'identical',
    expectedSameIdentity: true,
    left: 'https://example.com/docs?tab=one#intro',
    right: 'https://example.com/docs?tab=one#intro',
  },
  {
    dimension: 'query',
    expectedSameIdentity: false,
    left: 'https://example.com/docs?tab=one',
    right: 'https://example.com/docs?tab=two',
  },
  {
    dimension: 'hash',
    expectedSameIdentity: false,
    left: 'https://example.com/docs#one',
    right: 'https://example.com/docs#two',
  },
  {
    dimension: 'trailing-slash',
    expectedSameIdentity: false,
    left: 'https://example.com/docs',
    right: 'https://example.com/docs/',
  },
  {
    dimension: 'default-port',
    expectedSameIdentity: false,
    left: 'http://example.com:80/docs',
    right: 'http://example.com/docs',
  },
  {
    dimension: 'hostname-case',
    expectedSameIdentity: false,
    left: 'https://EXAMPLE.com/docs',
    right: 'https://example.com/docs',
  },
  {
    dimension: 'international-domain',
    expectedSameIdentity: false,
    left: 'https://例え.テスト/docs',
    right: 'https://xn--r8jz45g.xn--zckzah/docs',
  },
  {
    dimension: 'percent-encoding',
    expectedSameIdentity: false,
    left: 'https://example.com/%7Euser',
    right: 'https://example.com/~user',
  },
  {
    dimension: 'protocol',
    expectedSameIdentity: false,
    left: 'http://example.com/docs',
    right: 'https://example.com/docs',
  },
  {
    dimension: 'www',
    expectedSameIdentity: false,
    left: 'https://www.example.com/docs',
    right: 'https://example.com/docs',
  },
  {
    dimension: 'tracking-parameter',
    expectedSameIdentity: false,
    left: 'https://example.com/docs?utm_source=tabbin',
    right: 'https://example.com/docs',
  },
  {
    dimension: 'spa-route',
    expectedSameIdentity: false,
    left: 'https://example.com/app/inbox',
    right: 'https://example.com/app/settings',
  },
  {
    dimension: 'localhost-loopback',
    expectedSameIdentity: false,
    left: 'http://localhost:3000/docs',
    right: 'http://127.0.0.1:3000/docs',
  },
  {
    dimension: 'extension-url',
    expectedSameIdentity: false,
    left: 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/page.html',
    right: 'chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/page.html',
  },
  {
    dimension: 'file-url',
    expectedSameIdentity: false,
    left: 'file:///tmp/docs/readme.txt',
    right: 'file:///tmp/docs/./readme.txt',
  },
] as const satisfies readonly UrlIdentityCorpusEntry[]
