// The versions gate: the About dialog shows the native side's version, so every
// manifest that declares the app's version must declare the same one.
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { versionProblems } from '../tooling/versions'

const manifests = [
  'package.json',
  'src-ui/package.json',
  'src-tauri/Cargo.toml',
  'src-tauri/tauri.conf.json',
]

test('every manifest declares the same app version', () => {
  const files = new Map(manifests.map((path) => [path, readFileSync(path, 'utf8')] as const))
  expect(versionProblems(files)).toEqual([])
})
