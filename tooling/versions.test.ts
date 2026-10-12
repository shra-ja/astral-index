import { expect, test } from 'vitest'
import { declaredVersion, versionProblems } from './versions'

const cargo = (version: string) =>
  [
    '[package]',
    'name = "astral-index"',
    `version = "${version}"`,
    '',
    '[dependencies]',
    'serde = { version = "=1.0.229" }',
    'version = "9.9.9"',
  ].join('\n')

test('a manifest declares its package version', () => {
  expect(declaredVersion('package.json', '{ "name": "a", "version": "0.1.0" }')).toBe('0.1.0')
  expect(declaredVersion('src-tauri/tauri.conf.json', '{ "version": "0.2.0" }')).toBe('0.2.0')
  expect(declaredVersion('src-tauri/Cargo.toml', cargo('0.3.0'))).toBe('0.3.0')
  // The package section may also be the last one.
  expect(declaredVersion('Cargo.toml', '[package]\nversion = "0.4.0"\n')).toBe('0.4.0')
})

test('a manifest without a package version declares none', () => {
  expect(declaredVersion('package.json', '{ "name": "a" }')).toBeUndefined()
  expect(declaredVersion('package.json', '{ "version": 1 }')).toBeUndefined()
  // Only the package section counts, not a dependency's version.
  expect(declaredVersion('Cargo.toml', '[dependencies]\nversion = "1.0.0"\n')).toBeUndefined()
  expect(
    declaredVersion('Cargo.toml', '[package]\nname = "a"\n[lib]\nversion = "1.0.0"\n'),
  ).toBeUndefined()
})

test('agreeing versions pass', () => {
  const files = new Map([
    ['package.json', '{ "version": "0.1.0" }'],
    ['src-tauri/Cargo.toml', cargo('0.1.0')],
  ])
  expect(versionProblems(files)).toEqual([])
})

test('a missing or differing version is a problem naming the files', () => {
  const files = new Map([
    ['package.json', '{ "version": "0.1.0" }'],
    ['src-ui/package.json', '{ "name": "ui" }'],
    ['src-tauri/Cargo.toml', cargo('0.2.0')],
  ])
  expect(versionProblems(files)).toEqual([
    'src-ui/package.json declares no version',
    'versions differ: package.json 0.1.0, src-tauri/Cargo.toml 0.2.0',
  ])
})
