import { ESLint } from 'eslint'
import { beforeAll, expect, test } from 'vitest'
import { eslintConfig } from './eslint-config'

let eslint: ESLint
// The first type-aware lint builds the TypeScript program, which takes seconds on
// slow CI runners. Build it here, under its own timeout, so each test times only its
// own checks.
beforeAll(async () => {
  eslint = new ESLint({ overrideConfigFile: true, overrideConfig: eslintConfig() })
  await eslint.lintText('', { filePath: 'tooling/coverage.ts' })
}, 60_000)

// The rules reported for source text linted in place of an existing file: type-aware
// rules only lint files the TypeScript projects include, but take the text given.
async function rules(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages.map((message) => message.ruleId)
}

test('type-aware rules catch unawaited promises in tooling and verification', async () => {
  const floating = 'export async function load() {}\nload()\n'
  expect(await rules(floating, 'tooling/coverage.ts')).toContain(
    '@typescript-eslint/no-floating-promises',
  )
  expect(await rules(floating, 'tests/coverage-reports.test.ts')).toContain(
    '@typescript-eslint/no-floating-promises',
  )
})

test('tests follow the Vitest rules', async () => {
  const duplicate =
    "import { expect, test } from 'vitest'\ntest('a', () => { expect(1).toBe(1) })\ntest('a', () => { expect(2).toBe(2) })\n"
  expect(await rules(duplicate, 'tooling/coverage.test.ts')).toContain('vitest/no-identical-title')
  expect(await rules(duplicate, 'tests/coverage-reports.test.ts')).toContain(
    'vitest/no-identical-title',
  )
})

test('the frontend lints itself, and generated output is not linted', async () => {
  for (const path of [
    'src-ui/src/main.ts',
    'src-tauri/gen/x.ts',
    'coverage/tooling/x.js',
    'test-results/x.ts',
  ]) {
    expect(await eslint.isPathIgnored(path), path).toBe(true)
  }
  expect(await eslint.isPathIgnored('tooling/coverage.ts')).toBe(false)
  expect(await eslint.isPathIgnored('eslint.config.ts')).toBe(false)
})

test('an expectation may carry a failure message, and expect… helpers count as assertions', async () => {
  const code =
    "import { expect, test } from 'vitest'\nfunction expectFailure() {}\nconst why = 'reason'\ntest('a', () => { expect(1, why).toBe(1) })\ntest('b', () => { expectFailure() })\n"
  expect(await rules(code, 'tooling/coverage.test.ts')).toEqual([])
})

test('only the backend stage runners, which fail by throwing, need no assertions', async () => {
  const stage = "import { test } from 'vitest'\ntest('stage', () => { run() })\nfunction run() {}\n"
  expect(await rules(stage, 'tests/backend-coverage-stages.test.ts')).toEqual([])
  expect(await rules(stage, 'tests/coverage-reports.test.ts')).toContain('vitest/expect-expect')
})
