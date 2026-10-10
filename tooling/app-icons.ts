// The application icons: the brand's emblem in its tile, by the lockup's rules
// (decision 0023), rendered for the Windows executable, the Linux window and the
// `.deb`. `npm run icons` writes them to `src-tauri/icons/`, and `npm run check`
// fails if the committed files no longer match the brand files.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** The tile's colour and corner radius, and the emblem's colour, as in the sidebar. */
const TILE = '#202735'
const EMBLEM = '#faf9f5'
const CANVAS = 256
const RADIUS = 0.21
/** The emblem's box is 110% of the tile, centred, so it overhangs by 5% on each side. */
const EMBLEM_SCALE = 1.1

/** The small emblem's sizes; the brand's small set covers tiles up to 64 px. */
const SMALL_SIZES = [16, 24, 32, 48, 64]
const REGULAR_SIZES = [128, 256, 512]

/** The emblem file's drawing in its tile, as a standalone SVG. */
export function tileSvg(emblem: string): string {
  const drawing = /<g [\s\S]*<\/g>/.exec(emblem)?.[0]
  if (!drawing) throw new Error('The emblem file has no drawing')
  const box = CANVAS * EMBLEM_SCALE
  const offset = (CANVAS - box) / 2
  const svg = (attributes: string) => `<svg ${attributes} viewBox="0 0 256 256"`
  return [
    `${svg('xmlns="http://www.w3.org/2000/svg"')}>`,
    `<rect width="${CANVAS}" height="${CANVAS}" rx="${round(CANVAS * RADIUS)}" fill="${TILE}"/>`,
    `${svg(`x="${round(offset)}" y="${round(offset)}" width="${round(box)}" height="${round(box)}"`)} color="${EMBLEM}">`,
    drawing,
    '</svg>',
    '</svg>',
  ].join('\n')
}

const round = (value: number) => Math.round(value * 1000) / 1000

/** An ICO file holding each PNG under its size; ICO states 256 as 0. */
export function icoFile(images: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6 + 16 * images.length)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = header.length
  images.forEach(({ size, png }, index) => {
    const entry = 6 + 16 * index
    header[entry] = header[entry + 1] = size % 256
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(png.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += png.length
  })
  return Buffer.concat([header, ...images.map(({ png }) => png)])
}

/** Render an SVG to square PNGs of the given sizes with the Tauri CLI. */
export function renderPngs(svgPath: string, sizes: number[]): Map<number, Buffer> {
  const output = mkdtempSync(join(tmpdir(), 'app-icons-render-'))
  try {
    const sizeArgs = sizes.flatMap((size) => ['-p', String(size)])
    const run = spawnSync(
      process.execPath,
      ['node_modules/@tauri-apps/cli/tauri.js', 'icon', svgPath, '-o', output, ...sizeArgs],
      { encoding: 'utf8' },
    )
    if (run.status !== 0) {
      throw new Error(`Rendering ${svgPath} failed: ${(run.stderr + run.stdout).trim()}`)
    }
    return new Map(sizes.map((size) => [size, readFileSync(join(output, `${size}x${size}.png`))]))
  } finally {
    rmSync(output, { recursive: true, force: true })
  }
}

/**
 * Write the application icons into `iconsDir` from the emblems in `brandDir`, and
 * return their names. The small emblem draws sizes up to 64 px and the regular
 * emblem the larger ones: `icon.ico` for Windows, `icon.png` for the Linux window,
 * and PNGs the `.deb` installs.
 */
export function generateIcons(brandDir: string, iconsDir: string): string[] {
  const work = mkdtempSync(join(tmpdir(), 'app-icons-'))
  try {
    const render = (emblem: string, sizes: number[]) => {
      const svgPath = join(work, emblem.replace('.svg', '-tile.svg'))
      writeFileSync(svgPath, tileSvg(readFileSync(join(brandDir, emblem), 'utf8')))
      return renderPngs(svgPath, sizes)
    }
    const pngs = new Map([
      ...render('astral-index-emblem-small.svg', SMALL_SIZES),
      ...render('astral-index-emblem.svg', REGULAR_SIZES),
    ])
    const png = (size: number) => pngs.get(size) as Buffer
    const files: [string, Buffer][] = [
      ['icon.ico', icoFile([...SMALL_SIZES, 256].map((size) => ({ size, png: png(size) })))],
      ...[32, 64, 128, 256].map((size): [string, Buffer] => [`${size}x${size}.png`, png(size)]),
      ['icon.png', png(512)],
    ]
    for (const [name, data] of files) writeFileSync(join(iconsDir, name), data)
    return files.map(([name]) => name)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
