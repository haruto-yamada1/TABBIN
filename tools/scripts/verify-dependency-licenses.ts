import { readFileSync } from 'node:fs'

import JSON5 from 'json5'

import {
  readReviewedLicenseContents,
  reviewedLicensePolicy,
  verifyDependencyLicensePolicy,
} from './dependency-license-policy'

const lock = JSON5.parse<unknown>(readFileSync('bun.lock', 'utf8'))
verifyDependencyLicensePolicy(
  JSON.parse(readFileSync('package.json', 'utf8')),
  lock,
  readReviewedLicenseContents(lock),
)
console.log(
  `React Doctor product-code license review is valid until ${reviewedLicensePolicy.expiresAt} 00:00 UTC`,
)
