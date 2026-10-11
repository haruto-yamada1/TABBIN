import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

import { reviewDependencyChanges } from './dependency-review'
import type { ReviewRequest } from './dependency-review'

const basePath = process.env.BASE_LOCK
if (!basePath) {
  throw new Error('BASE_LOCK must point to the base commit bun.lock')
}

const request: ReviewRequest = async (url, init) => {
  const token = process.env.GITHUB_TOKEN
  return fetch(url, {
    ...init,
    headers:
      url.startsWith('https://api.github.com/') && token
        ? {
            authorization: `Bearer ${token}`,
            accept: 'application/vnd.github+json',
          }
        : {},
  })
}

const result = await reviewDependencyChanges(
  readFileSync(basePath, 'utf8'),
  readFileSync('bun.lock', 'utf8'),
  request,
)
// JSON avoids treating untrusted dependency metadata as workflow commands.
const report = JSON.stringify(result, null, 2)
mkdirSync('.output/dependency-review', { recursive: true })
writeFileSync('.output/dependency-review/report.json', `${report}\n`)
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `### Bun resolved dependency changes\n\n\`\`\`json\n${report}\n\`\`\`\n`,
  )
}
console.log(report)
if (result.findings.length) {
  process.exitCode = 1
}
