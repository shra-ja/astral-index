// The native end-to-end tests' accessibility audit: axe-core, injected into the
// running app's page through WebDriver, so the app itself ships nothing extra
// (decision 0028). Every WCAG 2.2 A and AA rule and every best-practice rule
// applies.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import type { AppSession } from './app-driver'

const axe = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')

/** The axe rule tags the audit enforces. */
export const auditedTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']

/**
 * The page's accessibility violations as shown, one "rule: element" line for each
 * element that fails a rule, so a failing test names what to fix.
 */
export async function accessibilityViolations(app: AppSession): Promise<string[]> {
  // A page keeps axe once injected; the app never reloads within a test.
  await app.execute(`if (!window.axe) { ${axe} }`)
  return app.executeAsync<string[]>(`
    const done = arguments[arguments.length - 1];
    axe
      .run(document, {
        runOnly: { type: 'tag', values: ${JSON.stringify(auditedTags)} },
        resultTypes: ['violations'],
      })
      .then((results) => done(results.violations.flatMap((rule) =>
        rule.nodes.map((node) => rule.id + ': ' + node.target.join(' ')))))
      .catch((error) => done(['axe failed: ' + error]));
  `)
}
