// The application icons from the brand's emblems (decision 0023): `npm run icons`
// writes them, and `npm run icons:check`, part of `npm run check`, fails when the
// committed files no longer match what the brand files produce.
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { generateIcons } from '../tooling/app-icons'

const brand = 'src-ui/src/assets/brand'
const icons = 'src-tauri/icons'

test('generate icons', () => {
  expect(generateIcons(brand, icons)).toContain('icon.ico')
})

test('committed icons match the brand', () => {
  const fresh = mkdtempSync(join(tmpdir(), 'app-icons-check-'))
  try {
    const current = (name: string) =>
      existsSync(join(icons, name)) &&
      readFileSync(join(fresh, name)).equals(readFileSync(join(icons, name)))
    const stale = generateIcons(brand, fresh).filter((name) => !current(name))
    expect(stale, 'run `npm run icons` and commit the result').toEqual([])
  } finally {
    rmSync(fresh, { recursive: true, force: true })
  }
})
