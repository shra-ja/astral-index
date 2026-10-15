// A release's version and notes (decision 0030): the pull requests merged since the
// last release tag, read from `git log`, decide the next semantic version, and their
// titles, Conventional Commits, become the notes. Pure functions over git's output;
// `tests/release.test.ts` runs git and writes what the release workflow reads.

/** A pull request merged into `main`, by number and title. */
export interface PullRequest {
  number: number
  title: string
}

/** A merged pull request read as a Conventional Commit. */
export interface Change {
  /** Its type, such as `feat` or `fix`; `other` when the title has none. */
  kind: string
  breaking: boolean
  /** The title without its type, starting with a capital letter. */
  summary: string
  number: number
}

const MERGE = /^Merge pull request #(\d+) from /
const SQUASH = /^(.*) \(#(\d+)\)$/
const CONVENTIONAL = /^([a-z]+)(?:\([^)]*\))?(!)?: (.+)$/

/**
 * The pull requests in `git log --first-parent --format=%s%x1f%b%x1e`, newest first:
 * merge commits carry the title in their body, squash merges end with the number.
 */
export function mergedPullRequests(log: string): PullRequest[] {
  return log.split('\x1e').flatMap((record) => {
    const [subject = '', body = ''] = record.trim().split('\x1f')
    const merge = MERGE.exec(subject)
    if (merge) return [{ number: Number(merge[1]), title: body.trim().split('\n')[0] }]
    const squash = SQUASH.exec(subject)
    return squash ? [{ number: Number(squash[2]), title: squash[1] }] : []
  })
}

const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** Each pull request's change, by its title's Conventional Commit type. */
export function changes(pullRequests: PullRequest[]): Change[] {
  return pullRequests.map(({ number, title }) => {
    const parts = CONVENTIONAL.exec(title)
    return parts
      ? { kind: parts[1], breaking: parts[2] === '!', summary: capitalised(parts[3]), number }
      : { kind: 'other', breaking: false, summary: capitalised(title), number }
  })
}

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const parts = (version: string) => version.split('.').map(Number)

/**
 * The version after `previous` that the changes call for: a breaking change is a
 * major release, a feature a minor one and anything else a patch. The first is 1.0.0.
 */
export function nextVersion(previous: string | undefined, changes: Change[]): string {
  if (previous === undefined) return '1.0.0'
  const [major, minor, patch] = parts(previous)
  if (changes.some((change) => change.breaking)) return `${major + 1}.0.0`
  if (changes.some((change) => change.kind === 'feat')) return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

/** The version the last release's tag names, refusing a tag that names none. */
export function lastRelease(tag: string | undefined): string | undefined {
  if (tag === undefined) return undefined
  const version = tag.slice(1)
  if (!VERSION.test(version)) throw new Error(`The last tag, ${tag}, is not a release like v1.2.0`)
  return version
}

/** The version to release: the one given, if any, checked, or else the next. */
export function releaseVersion(
  previous: string | undefined,
  given: string | undefined,
  next: string,
): string {
  const version = given?.trim()
  if (!version) return next
  if (!VERSION.test(version)) throw new Error(`${version} is not a version like 1.2.0`)
  const later = previous === undefined || compare(version, previous) > 0
  if (!later) throw new Error(`${version} is not after the last release, ${previous}`)
  return version
}

function compare(a: string, b: string): number {
  const [x, y] = [parts(a), parts(b)]
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]
}

interface Release {
  /** `owner/name` on GitHub. */
  repository: string
  tag: string
  /** The last release's tag, or none before the first. */
  previous: string | undefined
  changes: Change[]
  /** Notes given by hand, which replace the summary and the changes. */
  notes?: string
}

const sections: [title: string, includes: (change: Change) => boolean][] = [
  ['Breaking changes', (change) => change.breaking],
  ['Features', (change) => change.kind === 'feat' && !change.breaking],
  ['Fixes', (change) => change.kind === 'fix' && !change.breaking],
]

/**
 * The release's notes: the app and its version, linked to the changes since the
 * last release, then the breaking changes, features and fixes, or the notes given
 * by hand, then how to use the download.
 */
export function releaseNotes({ repository, tag, previous, changes, notes }: Release): string {
  const site = `https://github.com/${repository}`
  const given = notes?.trim()
  if (previous === undefined && !given) {
    throw new Error('The first release needs its notes given by hand')
  }
  const link =
    previous === undefined ? `${site}/commits/${tag}` : `${site}/compare/${previous}...${tag}`
  const listed = sections.flatMap(([title, includes]) => {
    const entries = changes.filter(includes)
    return entries.length
      ? [`### ${title}`, '', ...entries.map((entry) => `- ${entry.summary} (#${entry.number})`), '']
      : []
  })
  const body = given
    ? [given, '']
    : listed.length
      ? listed
      : ['No changes to the app’s features: this release updates how it is built and tested.', '']
  return [
    `## Astral Index [${tag}](${link})`,
    '',
    ...body,
    '### Usage',
    '',
    `Simply download and run Astral-Index-${tag}.exe. If you wish to run in [portable mode](${site}#portable-mode), create a \`data\` folder next to it before running it.`,
    '',
  ].join('\n')
}
