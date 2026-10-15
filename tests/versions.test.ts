// The versions gate: builds receive the app's version from the release tags
// (decision 0030), so no manifest may declare one, beyond Cargo's 0.0.0 placeholder.
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { versionProblems } from '../tooling/versions'

const manifests = [
  'package.json',
  'package-lock.json',
  'src-ui/package.json',
  'src-tauri/Cargo.toml',
  'src-tauri/tauri.conf.json',
]

test('no manifest declares the app version', () => {
  const files = new Map(manifests.map((path) => [path, readFileSync(path, 'utf8')] as const))
  expect(versionProblems(files)).toEqual([])
})
