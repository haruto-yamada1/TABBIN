import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import {
  verifyThirdPartyLicenseFiles,
  verifyThirdPartyLicenseZip,
} from '#third-party-licenses'
import { z } from 'zod'

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: { zip: { type: 'boolean', default: false } },
  strict: true,
})

if (values.zip) {
  const manifest = z
    .object({
      name: z.string().regex(/^[\w-]+$/u),
      version: z.string().regex(/^[\w.+-]+$/u),
    })
    .parse(JSON.parse(readFileSync('package.json', 'utf8')))
  await Promise.all(
    ['chrome', 'firefox', 'sources'].map(async (target) =>
      verifyThirdPartyLicenseZip(
        path.resolve(
          '.output',
          `${manifest.name}-${manifest.version}-${target}.zip`,
        ),
      ),
    ),
  )
  console.log(
    'Both extension ZIPs and the source ZIP include verified third-party licenses and corresponding sources',
  )
} else {
  await Promise.all(
    ['chrome-mv3', 'firefox-mv2'].map(async (target) =>
      verifyThirdPartyLicenseFiles(path.resolve('.output', target)),
    ),
  )
  console.log(
    'Both browser builds include verified third-party licenses and corresponding sources',
  )
}
