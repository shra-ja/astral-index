// The README's logo, the open lockup for dark and light backgrounds, from the brand
// files (decision 0023): `npm run readme:logo` writes it, and
// `npm run readme:logo:check`, part of `npm run check`, fails when the committed
// files no longer match what the brand files produce.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { lockupSvg } from '../tooling/readme-logo'

const brand = (name: string) => readFileSync(`src-ui/src/assets/brand/${name}`, 'utf8')
const folder = 'docs/assets/readme'
const logos = () => ({
  'astral-index-logo-dark.svg': lockupSvg(
    brand('astral-index-emblem.svg'),
    brand('astral-index-wordmark.svg'),
    '#faf9f5',
  ),
  'astral-index-logo-light.svg': lockupSvg(
    brand('astral-index-emblem.svg'),
    brand('astral-index-wordmark-light.svg'),
    '#202735',
  ),
})

test('write the README logo', () => {
  mkdirSync(folder, { recursive: true })
  for (const [name, svg] of Object.entries(logos())) writeFileSync(`${folder}/${name}`, svg)
  expect(existsSync(`${folder}/astral-index-logo-dark.svg`)).toBe(true)
})

test('the README logo matches the brand', () => {
  const stale = Object.entries(logos())
    .filter(
      ([name, svg]) =>
        !existsSync(`${folder}/${name}`) || readFileSync(`${folder}/${name}`, 'utf8') !== svg,
    )
    .map(([name]) => name)
  expect(
    stale,
    `stale: ${stale.join(', ')}; run \`npm run readme:logo\` and commit the result`,
  ).toEqual([])
})
