import { expect, test } from 'vitest'
import { changes, mergedPullRequests, nextVersion, releaseNotes, releaseVersion } from './release'

// `git log --first-parent --format=%s%x1f%b%x1e`: each commit's subject and body,
// separated by a unit separator and ended by a record separator.
const log = (...commits: [string, string?][]) =>
  commits.map(([subject, body = '']) => `${subject}\x1f${body}\x1e`).join('\n')

test('merged pull requests come from merge commits and squash merges, newest first', () => {
  const merged = mergedPullRequests(
    log(
      ['Merge pull request #118 from shra-ja/build/tag-version', 'build: take the version\n'],
      ['fix(ui): close About from its backdrop (#116)'],
      ['Merge branch main into topic', 'feat: not a pull request'],
      ['docs: a commit pushed without a pull request'],
      ['Merge pull request #117 from shra-ja/feat/emblem', ''],
    ),
  )
  expect(merged).toEqual([
    { number: 118, title: 'build: take the version' },
    { number: 116, title: 'fix(ui): close About from its backdrop' },
    // A merge commit without the pull request's title keeps its number, untitled.
    { number: 117, title: '' },
  ])
})

test('pull request titles become changes by their Conventional Commit type', () => {
  expect(
    changes([
      { number: 117, title: 'feat(ui): show the bare emblem in the sidebar' },
      { number: 116, title: 'fix: windows polish for About' },
      { number: 120, title: 'feat!: drop the old database format' },
      { number: 118, title: 'build: take the version from release tags' },
      { number: 121, title: 'Update the readme' },
    ]),
  ).toEqual([
    { kind: 'feat', breaking: false, summary: 'Show the bare emblem in the sidebar', number: 117 },
    { kind: 'fix', breaking: false, summary: 'Windows polish for About', number: 116 },
    { kind: 'feat', breaking: true, summary: 'Drop the old database format', number: 120 },
    { kind: 'build', breaking: false, summary: 'Take the version from release tags', number: 118 },
    // A title that is not a Conventional Commit counts as neither feature nor fix.
    { kind: 'other', breaking: false, summary: 'Update the readme', number: 121 },
  ])
})

test('the next version follows semantic versioning from the changes', () => {
  const change = (kind: string, breaking = false) => ({ kind, breaking, summary: 'x', number: 1 })
  expect(nextVersion('1.2.3', [change('fix'), change('docs')])).toBe('1.2.4')
  expect(nextVersion('1.2.3', [change('fix'), change('feat')])).toBe('1.3.0')
  expect(nextVersion('1.2.3', [change('feat'), change('fix', true)])).toBe('2.0.0')
  // Nothing user-facing is still a release: a patch.
  expect(nextVersion('1.2.3', [])).toBe('1.2.4')
  // The first release is 1.0.0 (decision 0030).
  expect(nextVersion(undefined, [change('feat')])).toBe('1.0.0')
})

test('a version given by hand is used when it is a plain version after the last', () => {
  expect(releaseVersion('1.2.3', '1.3.0', '1.2.4')).toBe('1.3.0')
  expect(releaseVersion('1.2.3', ' ', '1.2.4')).toBe('1.2.4')
  expect(releaseVersion('1.2.3', undefined, '1.2.4')).toBe('1.2.4')
  expect(releaseVersion(undefined, '1.0.0', '1.0.0')).toBe('1.0.0')
  for (const [given, problem] of [
    ['v1.3.0', 'not a version like 1.2.0'],
    ['1.3', 'not a version like 1.2.0'],
    ['1.3.0-beta.1', 'not a version like 1.2.0'],
    ['01.3.0', 'not a version like 1.2.0'],
    ['1.2.3', 'not after the last release, 1.2.3'],
    ['1.2.2', 'not after the last release, 1.2.3'],
    ['0.9.10', 'not after the last release, 1.2.3'],
  ]) {
    expect(() => releaseVersion('1.2.3', given, '1.2.4'), given).toThrow(`${given} is ${problem}`)
  }
  // Versions compare by number, not as text.
  expect(releaseVersion('1.9.0', '1.10.0', '1.9.1')).toBe('1.10.0')
})

const repository = 'shra-ja/astral-index'
const howToUse = [
  '### Usage',
  '',
  'Simply download and run Astral-Index-v1.1.0.exe. If you wish to run in [portable mode](https://github.com/shra-ja/astral-index#portable-mode), create a `data` folder next to it before running it.',
  '',
].join('\n')

test('the notes list breaking changes, features and fixes under the app and its version', () => {
  const notes = releaseNotes({
    repository,
    tag: 'v1.1.0',
    previous: 'v1.0.0',
    changes: [
      {
        kind: 'feat',
        breaking: false,
        summary: 'Show the bare emblem in the sidebar',
        number: 117,
      },
      { kind: 'build', breaking: false, summary: 'Take the version from tags', number: 118 },
      { kind: 'fix', breaking: false, summary: 'Windows polish for About', number: 116 },
      { kind: 'fix', breaking: true, summary: 'Drop the old format', number: 115 },
      { kind: 'feat', breaking: false, summary: 'Show the build in About', number: 114 },
    ],
  })
  expect(notes).toBe(
    [
      '## Astral Index [v1.1.0](https://github.com/shra-ja/astral-index/compare/v1.0.0...v1.1.0)',
      '',
      '### Breaking changes',
      '',
      '- Drop the old format (#115)',
      '',
      '### Features',
      '',
      '- Show the bare emblem in the sidebar (#117)',
      '- Show the build in About (#114)',
      '',
      '### Fixes',
      '',
      '- Windows polish for About (#116)',
      '',
      howToUse,
    ].join('\n'),
  )
})

test('without features or fixes, the notes say the app is unchanged', () => {
  const notes = releaseNotes({
    repository,
    tag: 'v1.1.0',
    previous: 'v1.0.0',
    changes: [{ kind: 'ci', breaking: false, summary: 'Cache the builds', number: 119 }],
  })
  expect(notes).toBe(
    [
      '## Astral Index [v1.1.0](https://github.com/shra-ja/astral-index/compare/v1.0.0...v1.1.0)',
      '',
      'No changes to the app’s features: this release updates how it is built and tested.',
      '',
      howToUse,
    ].join('\n'),
  )
})

test('notes given by hand replace the summary and changes, inside the same frame', () => {
  const notes = releaseNotes({
    repository,
    tag: 'v1.1.0',
    previous: 'v1.0.0',
    changes: [{ kind: 'feat', breaking: false, summary: 'Ignored', number: 117 }],
    notes: '  The sidebar is clearer.\n\n### Features\n\n- The emblem stands alone (#117).\n\n',
  })
  expect(notes).toBe(
    [
      '## Astral Index [v1.1.0](https://github.com/shra-ja/astral-index/compare/v1.0.0...v1.1.0)',
      '',
      'The sidebar is clearer.',
      '',
      '### Features',
      '',
      '- The emblem stands alone (#117).',
      '',
      howToUse,
    ].join('\n'),
  )
})

test('the first release links its commits, and needs notes given by hand', () => {
  const first = { repository, tag: 'v1.0.0', previous: undefined, changes: [] }
  expect(releaseNotes({ ...first, notes: 'A local record of your warp history.' })).toContain(
    '## Astral Index [v1.0.0](https://github.com/shra-ja/astral-index/commits/v1.0.0)',
  )
  // Every pull request ever merged would be listed otherwise.
  expect(() => releaseNotes(first)).toThrow('The first release needs its notes given by hand')
  expect(() => releaseNotes({ ...first, notes: ' ' })).toThrow(
    'The first release needs its notes given by hand',
  )
})
