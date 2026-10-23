import { describe, expect, it } from 'vitest'
import { ZodError } from 'zod'

import {
  assertLoadProvenance,
  loadScenarios,
  parseInitialLoadReport,
  parseLoadObservations,
  renderInitialLoadReport,
} from './initialLoadReport'

const observation = () => ({
  artifactSha256: 'a'.repeat(64),
  browserVersion: '155.0',
  features: Object.fromEntries(
    Object.keys(loadScenarios).map((feature) => [
      feature,
      ['chunks/app.js', `chunks/${feature}.js`],
    ]),
  ),
})
const metadata = {
  schemaVersion: 1,
  scenario: 'fresh-profile-empty-en-v1',
  method: 'parsed-module-sources-v1',
  revision: 'a'.repeat(40),
  environment: 'linux/x64; Node 24; Bun 1.3',
}
const report = (javascriptBytes = 100) =>
  parseInitialLoadReport({
    ...metadata,
    browsers: Object.fromEntries(
      ['chrome', 'firefox'].map((browser) => [
        browser,
        {
          artifactSha256: 'a'.repeat(64),
          browserVersion: '155.0',
          sizes: {
            features: Object.fromEntries(
              Object.keys(loadScenarios).map((feature) => [
                feature,
                {
                  javascriptBytes,
                  sharedJavascriptBytes: 20,
                  files: [
                    { path: 'app.js', bytes: 20 },
                    { path: `${feature}.js`, bytes: javascriptBytes - 20 },
                  ],
                },
              ]),
            ),
            uniqueJavascriptBytes: 20 + 4 * (javascriptBytes - 20),
            sharedJavascriptBytes: 20,
          },
        },
      ]),
    ),
  })

describe('initial load measurement contract', () => {
  it('requires all four screens in both browser engines and rejects mixed scenarios', () => {
    const valid = {
      ...metadata,
      browsers: { chrome: observation(), firefox: observation() },
    }
    expect(parseLoadObservations(valid)).toEqual(valid)
    expect(() =>
      parseLoadObservations({ ...valid, scenario: 'warm-profile' }),
    ).toThrow(ZodError)
    expect(() =>
      parseLoadObservations({ ...valid, browsers: { chrome: observation() } }),
    ).toThrow(ZodError)
    const incomplete = observation()
    delete incomplete.features.options
    expect(() =>
      parseLoadObservations({
        ...valid,
        browsers: { ...valid.browsers, chrome: incomplete },
      }),
    ).toThrow(ZodError)
    const empty = observation()
    empty.features.options = []
    expect(() =>
      parseLoadObservations({
        ...valid,
        browsers: { ...valid.browsers, firefox: empty },
      }),
    ).toThrow(ZodError)
  })

  it('rejects stale, mixed-build and mixed-revision observations before reporting sizes', () => {
    const observations = parseLoadObservations({
      ...metadata,
      browsers: { chrome: observation(), firefox: observation() },
    })
    expect(() =>
      assertLoadProvenance(observations, metadata.revision, {
        chrome: 'a'.repeat(64),
        firefox: 'a'.repeat(64),
      }),
    ).not.toThrow()
    expect(() =>
      assertLoadProvenance(observations, 'b'.repeat(40), {
        chrome: 'a'.repeat(64),
        firefox: 'a'.repeat(64),
      }),
    ).toThrow(/another revision/u)
    expect(() =>
      assertLoadProvenance(observations, metadata.revision, {
        chrome: 'b'.repeat(64),
        firefox: 'a'.repeat(64),
      }),
    ).toThrow(/Stale chrome/u)
    expect(() =>
      assertLoadProvenance(observations, metadata.revision, {
        chrome: 'a'.repeat(64),
        firefox: 'b'.repeat(64),
      }),
    ).toThrow(/Stale firefox/u)
  })

  it('rejects invalid provenance and byte counts', () => {
    const valid = {
      ...metadata,
      browsers: { chrome: observation(), firefox: observation() },
    }
    expect(() => parseLoadObservations({ ...valid, revision: '' })).toThrow(
      ZodError,
    )
    expect(() =>
      parseLoadObservations({
        ...valid,
        browsers: {
          ...valid.browsers,
          chrome: { ...observation(), artifactSha256: 'missing' },
        },
      }),
    ).toThrow(ZodError)
    const invalid = report()
    invalid.browsers.chrome.sizes.features.options.javascriptBytes = -1
    expect(() => parseInitialLoadReport(invalid)).toThrow(ZodError)
  })

  it.each([
    [100, 'unchanged'],
    [105, 'within policy'],
    [106, 'report'],
    [110, 'report'],
    [111, 'review required'],
    [90, 'decreased'],
  ])(
    'reports %s bytes with the existing artifact advisory policy',
    (bytes, status) => {
      const markdown = renderInitialLoadReport(report(bytes), report(), {
        reportPercent: 5,
        reviewPercent: 10,
        hardBudgets: [],
      })
      expect(markdown).toContain(`| options | 100 B | ${bytes} B |`)
      expect(
        markdown
          .split('\n')
          .find((line) => line.startsWith('| options | 100 B')),
      ).toContain(status)
      expect(markdown).toContain('Unique union (all screens)')
      expect(markdown).toContain('| Unique JS files |\n| --- |')
      expect(markdown).toContain('do not add them again or sum screens')
      expect(markdown).toContain('not parse CPU time or HTTP transferSize')
    },
  )
})
