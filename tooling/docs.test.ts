import { expect, test } from 'vitest'
import { checkDocs, headingAnchors, links, type DocsInput } from './docs'

test('links are relative targets with their line, outside code', () => {
  const markdown = [
    'See [a](a.md) and [b](dir/b.md#part), ![image](pic.png).',
    'Skip [web](https://example.com), [mail](mailto:x@example.com) and `[code](c.md)`.',
    '```text',
    '[fenced](f.md)',
    '```',
    '~~~',
    '[tilde](t.md)',
    '~~~',
    'Same file [anchor](#top).',
  ].join('\n')
  expect(links(markdown, 'notes.md')).toEqual([
    { line: 1, target: 'a.md' },
    { line: 1, target: 'dir/b.md#part' },
    { line: 1, target: 'pic.png' },
    { line: 9, target: '#top' },
  ])
})

test('Rust files contribute only links in doc comments', () => {
  const rust = [
    '//! Module docs, see [decision](../docs/d.md).',
    '/// Item docs, see [other](../docs/o.md).',
    'let call = handlers[0](input);',
    '// A plain comment with [ignored](x.md).',
  ].join('\n')
  expect(links(rust, 'src/lib.rs')).toEqual([
    { line: 1, target: '../docs/d.md' },
    { line: 2, target: '../docs/o.md' },
  ])
})

test('heading anchors follow GitHub, numbering repeats', () => {
  const markdown = [
    '# Project status',
    '## Pagination evidence (2026-09-19)',
    '### `fetch_history` and [links](x.md)',
    '## Notes',
    '## Notes',
    '```',
    '## Not a heading',
    '```',
    '#Not a heading either',
  ].join('\n')
  expect([...headingAnchors(markdown)]).toEqual([
    'project-status',
    'pagination-evidence-2026-09-19',
    'fetch_history-and-links',
    'notes',
    'notes-1',
  ])
})

/** A small repository: AGENTS.md links to everything a check should accept. */
function input(overrides: Partial<DocsInput> = {}): DocsInput {
  const files = new Map([
    [
      'AGENTS.md',
      '# Agents\n\n[Status](docs/STATUS.md), [guide](docs/guide.md#setup), [docs](docs/)\n',
    ],
    [
      'docs/STATUS.md',
      '# Status\n\nSee [agents](../AGENTS.md#agents) and [licence](../LICENSE).\n',
    ],
    ['docs/guide.md', '# Guide\n\n## Setup\n\nBack to [top](#guide).\n'],
    ['README.md', '# Readme\n'],
    ['src/lib.rs', '//! See [guide](../docs/guide.md#setup).\n'],
  ])
  return {
    files,
    tracked: new Set([...files.keys(), 'LICENSE']),
    entry: 'AGENTS.md',
    unreachable: ['README.md'],
    status: { path: 'docs/STATUS.md', maxLines: 5 },
    ...overrides,
  }
}

test('a sound set of docs has no problems', () => {
  expect(checkDocs(input())).toEqual([])
})

test('broken links and missing anchors are reported; anchors into other files are not checked', () => {
  const files = new Map(input().files)
  files.set(
    'docs/guide.md',
    '# Guide\n\n## Setup\n\n[gone](missing.md), [no anchor](../AGENTS.md#nope), [here](#nowhere), [code](../src/lib.rs#x)\n',
  )
  expect(checkDocs(input({ files }))).toEqual([
    'docs/guide.md:5: missing.md does not exist',
    'docs/guide.md:5: ../AGENTS.md has no heading for #nope',
    'docs/guide.md:5: docs/guide.md has no heading for #nowhere',
  ])
})

test('Markdown not reachable from the entry point is reported, except the allowlist', () => {
  const files = new Map(input().files)
  files.set('docs/orphan.md', '# Orphan\n')
  expect(checkDocs(input({ files }))).toEqual([
    'docs/orphan.md is not reachable by links from AGENTS.md',
  ])
  expect(checkDocs(input({ files, unreachable: ['README.md', 'docs/orphan.md'] }))).toEqual([])
})

test('STATUS over its line budget is reported', () => {
  expect(checkDocs(input({ status: { path: 'docs/STATUS.md', maxLines: 2 } }))).toEqual([
    'docs/STATUS.md has 3 lines, over its budget of 2; archive integrated sections',
  ])
})
