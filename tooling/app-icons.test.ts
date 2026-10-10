import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { generateIcons, icoFile, renderPngs, tileSvg } from './app-icons'

const brand = 'src-ui/src/assets/brand'
const emblem = readFileSync(join(brand, 'astral-index-emblem-small.svg'), 'utf8')
const folders: string[] = []
const scratch = () => {
  const folder = mkdtempSync(join(tmpdir(), 'app-icons-'))
  folders.push(folder)
  return folder
}
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

/** A PNG's width and height, from its header. */
const dimensions = (png: Buffer) => [png.readUInt32BE(16), png.readUInt32BE(20)]
/** An ICO file's images: each entry's stated size and its PNG. */
const icoImages = (ico: Buffer) =>
  Array.from({ length: ico.readUInt16LE(4) }, (_, index) => {
    const entry = 6 + 16 * index
    const [bytes, offset] = [ico.readUInt32LE(entry + 8), ico.readUInt32LE(entry + 12)]
    return { size: ico[entry] || 256, png: ico.subarray(offset, offset + bytes) }
  })

test('places the emblem in its tile by the lockup rules, without its title', () => {
  const svg = tileSvg(emblem)
  // A 256 px canvas filled by the tile: #202735 with a 21% corner radius.
  expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 256 256">/)
  expect(svg).toContain('<rect width="256" height="256" rx="53.76" fill="#202735"/>')
  // The emblem's box at 110% of the tile, centred, in #faf9f5.
  expect(svg).toContain(
    '<svg x="-12.8" y="-12.8" width="281.6" height="281.6" viewBox="0 0 256 256" color="#faf9f5">',
  )
  // Its drawing exactly as supplied, without the title and description.
  const drawing = emblem.slice(emblem.indexOf('<g '), emblem.lastIndexOf('</g>') + 4)
  expect(svg).toContain(drawing)
  expect(svg).not.toMatch(/<title|<desc|role=|aria-/)
})

test('refuses an emblem file without a drawing', () => {
  expect(() => tileSvg('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).toThrow(
    'The emblem file has no drawing',
  )
})

test('an ICO file holds each PNG under its size, 256 stated as 0', () => {
  const small = Buffer.from('small png')
  const large = Buffer.from('large png bytes')
  const ico = icoFile([
    { size: 16, png: small },
    { size: 256, png: large },
  ])
  // Header: reserved, type 1 (icon), two images.
  expect([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)]).toEqual([0, 1, 2])
  // Entries: width, height, palette, reserved, planes, bits per pixel, then size and offset.
  expect([...ico.subarray(6, 10), ico.readUInt16LE(10), ico.readUInt16LE(12)]).toEqual([
    16, 16, 0, 0, 1, 32,
  ])
  expect([...ico.subarray(22, 26)]).toEqual([0, 0, 0, 0])
  expect(icoImages(ico)).toEqual([
    { size: 16, png: small },
    { size: 256, png: large },
  ])
  expect(ico.length).toBe(6 + 2 * 16 + small.length + large.length)
})

test('renders an SVG to PNGs of exactly the sizes asked for', () => {
  const folder = scratch()
  writeFileSync(join(folder, 'tile.svg'), tileSvg(emblem))
  const pngs = renderPngs(join(folder, 'tile.svg'), [16, 48])
  expect([...pngs.keys()]).toEqual([16, 48])
  expect([...pngs.values()].map(dimensions)).toEqual([
    [16, 16],
    [48, 48],
  ])
})

test('a failed render says which file and why', () => {
  expect(() => renderPngs(join(scratch(), 'missing.svg'), [16])).toThrow(
    /Rendering .*missing\.svg failed: /,
  )
})

test('writes the app icons, the small emblem up to 64 px and the regular one above', () => {
  const folder = scratch()
  expect(generateIcons(brand, folder)).toEqual([
    'icon.ico',
    '32x32.png',
    '64x64.png',
    '128x128.png',
    '256x256.png',
    'icon.png',
  ])
  expect(readdirSync(folder).sort()).toEqual(
    ['128x128.png', '256x256.png', '32x32.png', '64x64.png', 'icon.ico', 'icon.png'].sort(),
  )
  const file = (name: string) => readFileSync(join(folder, name))
  expect(
    ['32x32.png', '64x64.png', '128x128.png', '256x256.png', 'icon.png'].map((name) =>
      dimensions(file(name)),
    ),
  ).toEqual([
    [32, 32],
    [64, 64],
    [128, 128],
    [256, 256],
    [512, 512],
  ])
  const ico = icoImages(file('icon.ico'))
  expect(ico.map((image) => [image.size, dimensions(image.png)[0]])).toEqual([
    [16, 16],
    [24, 24],
    [32, 32],
    [48, 48],
    [64, 64],
    [256, 256],
  ])
  // Each size comes from its own emblem: the small one up to 64 px, the regular above.
  const small = scratch()
  const regular = scratch()
  writeFileSync(join(small, 'tile.svg'), tileSvg(emblem))
  writeFileSync(
    join(regular, 'tile.svg'),
    tileSvg(readFileSync(join(brand, 'astral-index-emblem.svg'), 'utf8')),
  )
  const fromSmall = renderPngs(join(small, 'tile.svg'), [32, 64, 256])
  const fromRegular = renderPngs(join(regular, 'tile.svg'), [64, 256])
  expect(file('32x32.png')).toEqual(fromSmall.get(32))
  expect(file('64x64.png')).toEqual(fromSmall.get(64))
  expect(file('64x64.png')).not.toEqual(fromRegular.get(64))
  expect(file('256x256.png')).toEqual(fromRegular.get(256))
  expect(file('256x256.png')).not.toEqual(fromSmall.get(256))
  expect(ico.find((image) => image.size === 64)?.png).toEqual(file('64x64.png'))
  expect(ico.find((image) => image.size === 256)?.png).toEqual(file('256x256.png'))
})
