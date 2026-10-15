// The README's logo: the brand's open lockup, the regular emblem without its tile
// beside the regular wordmark (decision 0023), as one SVG per background, for
// GitHub's light and dark themes. Built from the brand files so they stay in step;
// `tests/readme-logo.test.ts` writes and checks them.

/** The emblem's artwork within its 256 box, as the brand crops it for the open lockup. */
const ARTWORK = { x: 41.82, y: 70.88, width: 187.28, height: 124.47 }
/** The lockup's sizes per H, the wordmark's height: the emblem's, and the gap. */
const EMBLEM_HEIGHT = 1.284
const GAP = 0.4
/** H, in the lockup's own units; the README sets the displayed size. */
const H = 100

const round = (value: number) => Math.round(value * 1000) / 1000

/**
 * The open lockup from the emblem and wordmark files' text, the emblem drawn in
 * `colour`: `#faf9f5` with the dark-background wordmark, `#202735` with the light.
 */
export function lockupSvg(emblem: string, wordmark: string, colour: string): string {
  const drawing = /<g [\s\S]*<\/g>/.exec(emblem)?.[0]
  if (!drawing) throw new Error('The emblem file has no drawing')
  const box = /viewBox="([^"]+)"/.exec(wordmark)?.[1]
  if (!box) throw new Error('The wordmark file has no viewBox')
  const [, , boxWidth, boxHeight] = box.split(/\s+/).map(Number)
  const lettering = wordmark
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/<title[^>]*>[\s\S]*?<\/title>/, '')
  const emblemHeight = EMBLEM_HEIGHT * H
  const emblemWidth = round((emblemHeight * ARTWORK.width) / ARTWORK.height)
  const wordmarkWidth = round((H * boxWidth) / boxHeight)
  const width = round(emblemWidth + GAP * H + wordmarkWidth)
  const artwork = `${ARTWORK.x} ${ARTWORK.y} ${ARTWORK.width} ${ARTWORK.height}`
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${emblemHeight}" role="img" aria-label="Astral Index"><title>Astral Index</title>`,
    `<svg x="0" y="0" width="${emblemWidth}" height="${emblemHeight}" viewBox="${artwork}" color="${colour}">${drawing}</svg>`,
    `<svg x="${round(emblemWidth + GAP * H)}" y="${round((emblemHeight - H) / 2)}" width="${wordmarkWidth}" height="${H}" viewBox="${box}">${lettering}</svg>`,
    '</svg>',
    '',
  ].join('\n')
}
