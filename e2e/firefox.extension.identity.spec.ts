import { expect, findInstallUuid, test } from './helpers/firefox-extension'

test.describe('Firefox smoke installed extension identity', () => {
  test('finds the copied extension by its manifest id', () => {
    expect(
      findInstallUuid({
        addons: [
          {
            id: 'tabbin@local',
            path: '/tmp/firefox-profile/extensions/tabbin@local',
            internalUUID: 'installed-tabbin-uuid',
          },
        ],
      }),
    ).toBe('installed-tabbin-uuid')
  })

  test('rejects unrelated extensions even when their path contains the artifact name', () => {
    expect(
      findInstallUuid({
        addons: [
          {
            id: 'unrelated@example.test',
            path: '/tmp/firefox-mv2/unrelated',
            internalUUID: 'wrong-extension',
          },
        ],
      }),
    ).toBeUndefined()
  })

  test('requires the installation UUID and never substitutes the manifest id', () => {
    expect(
      findInstallUuid({ addons: [{ id: 'tabbin@local' }] }),
    ).toBeUndefined()
    expect(findInstallUuid({ addons: [null] })).toBeUndefined()
    expect(findInstallUuid(null)).toBeUndefined()
  })
})
