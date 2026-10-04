// The docs gate: agents rely on the Markdown, so its links and anchors must resolve,
// every doc must be reachable from AGENTS.md, and STATUS must stay within its budget.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { checkDocs } from '../tooling/docs'

// Tracked and new files, so a doc is checked before it is committed.
const paths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  encoding: 'utf8',
})
  .split('\n')
  .filter((path) => path && existsSync(path))

test('docs links resolve, every doc is reachable from AGENTS.md, and STATUS stays short', () => {
  const files = new Map(
    paths
      .filter((path) => /\.(md|rs)$/.test(path))
      .map((path) => [path, readFileSync(path, 'utf8')] as const),
  )
  expect(
    checkDocs({
      files,
      tracked: new Set(paths),
      entry: 'AGENTS.md',
      // The README is for people using the app; agents start from AGENTS.md.
      unreachable: ['README.md'],
      status: { path: 'docs/status/STATUS.md', maxLines: 150 },
    }),
  ).toEqual([])
})
