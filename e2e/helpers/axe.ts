import { AxeBuilder } from '@axe-core/playwright'
import type { Page } from '@playwright/test'

import { expect } from './extension'

/**
 * axe-core による accessibility 自動検査の smoke-test helper。
 *
 * ## 方針
 *
 * - デフォルトで axe-core の全ルールを適用する (WCAG 2.0/2.1 A・AA)。
 * - violation が 0 件であることを assert する。
 * - false positive が発生した場合は、ルールを disable するのではなく
 *   まずコード側で根本原因を修正することを試みる。
 *   やむを得ず disable する場合は `disabledRules` に追加し、
 *   その理由をコメントで明記する。
 *
 * ## 今後の拡張
 *
 * - ai-chat / analytics など他画面への展開は各画面の
 *   `*.a11y.extension.spec.ts` を追加することで行う。
 * - キーボード操作など自動検査で拾えない項目は別途 E2E で補う。
 */

/**
 * 現在 disable しているルール。
 *
 * - なし: 全ルールが通過している。
 *
 * 今後追加する場合は以下の形式で理由を併記すること:
 *   'rule-id': 'reason ...',
 */
const disabledRules: Record<string, string> = {}

/**
 * AxeBuilder を構築する。
 * 共通設定 (disable rules, tags) をここに集約する。
 */
const createAxeBuilder = (page: Page): AxeBuilder => {
  const builder = new AxeBuilder({ page }).withTags([
    'wcag2a',
    'wcag2aa',
    'wcag21a',
    'wcag21aa',
  ])

  const ruleIds = Object.keys(disabledRules)
  if (ruleIds.length > 0) {
    builder.disableRules(ruleIds)
  }

  return builder
}

/**
 * ページに対して axe 検査を実行し、violation が 0 件であることを assert する。
 *
 * @param page - 検査対象の Playwright Page
 * @param label - テスト出力で識別しやすいよう violation の詳細に添えるラベル
 */
export const assertNoAxeViolations = async (
  page: Page,
  label: string,
): Promise<void> => {
  const results = await createAxeBuilder(page).analyze()

  if (results.violations.length > 0) {
    const summary = results.violations
      .map((violation) => {
        const nodes = violation.nodes
          .map(
            (node) =>
              `    - target: ${node.target.join(' > ')}\n      html: ${node.html}\n      ${node.failureSummary ?? 'No failure summary'}`,
          )
          .join('\n')

        return `  - ${violation.id} (${violation.impact ?? 'unknown'}): ${violation.help} — ${violation.nodes.length} node(s)\n${nodes}`
      })
      .join('\n')

    throw new Error(
      `axe accessibility violations on "${label}" (${results.violations.length} rule(s)):\n${summary}`,
    )
  }

  expect(results.violations).toHaveLength(0)
}
