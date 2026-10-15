// The release's version and notes, for the release workflow (decision 0030):
// `npm run release:prepare`, with the workflow's optional inputs in RELEASE_VERSION
// and RELEASE_NOTES. It writes the notes to `test-results/release/notes.md`, and the
// version and tag to GITHUB_OUTPUT when the workflow provides one.
import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { outputs } from '../tooling/outputs'
import {
  changes,
  lastRelease,
  mergedPullRequests,
  nextVersion,
  releaseNotes,
  releaseVersion,
} from '../tooling/release'

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim()

/** The last release's tag, or none before the first release. */
function lastTag(): string | undefined {
  try {
    // Release tags only: not, say, v1.0.0-rc1, which lastRelease would refuse.
    return git('describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*', '--exclude', 'v*[!0-9.]*')
  } catch {
    return undefined
  }
}

test('write the release', () => {
  const previous = lastTag()
  const range = previous ? `${previous}..HEAD` : 'HEAD'
  const merged = changes(
    mergedPullRequests(git('log', '--first-parent', '--format=%s%x1f%b%x1e', range)),
  )
  const last = lastRelease(previous)
  const version = releaseVersion(last, process.env.RELEASE_VERSION, nextVersion(last, merged))
  const tag = `v${version}`
  // A version is released once: its tag must not exist yet.
  expect(git('tag', '--list', tag), `${tag} is already released`).toBe('')
  const notes = releaseNotes({
    repository: process.env.GITHUB_REPOSITORY ?? 'shra-ja/astral-index',
    tag,
    previous,
    changes: merged,
    notes: process.env.RELEASE_NOTES,
  })
  const folder = `${outputs().results}/release`
  mkdirSync(folder, { recursive: true })
  writeFileSync(`${folder}/notes.md`, notes)
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\ntag=${tag}\n`)
  }
  console.log(`${tag}\n\n${notes}`)
})
