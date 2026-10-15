import { expect, test } from 'vitest'
import { lockupSvg } from './readme-logo'

// Small stand-ins for the brand files: an emblem drawn in currentColor in a 256 box,
// and a wordmark with a title, a gradient and its own viewBox, 7 units wide per unit high.
const emblem =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" color="#000000"><title id="title">Emblem</title><desc id="desc">About it</desc>\n  <g fill="currentColor"><path d="M0 0Z"/></g>\n</svg>\n'
const wordmark =
  '<svg xmlns="http://www.w3.org/2000/svg" width="700" height="100" viewBox="0 -100 700 100" role="img" aria-labelledby="title"><title id="title">Wordmark</title><defs><linearGradient id="g"/></defs><path d="M1 1Z"/></svg>'

test('the open lockup sets the emblem 1.284 H high, 0.4 H before the wordmark, centred on it', () => {
  const svg = lockupSvg(emblem, wordmark, '#faf9f5')
  // H is 100: the emblem is 128.4 high and 193.193 wide (its artwork, 187.28 × 124.47),
  // the gap 40, and the wordmark 700 wide, 14.2 down so the two share a centre line.
  expect(svg).toMatch(
    /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 933\.193 128\.4"/,
  )
  expect(svg).toContain(
    '<svg x="0" y="0" width="193.193" height="128.4" viewBox="41.82 70.88 187.28 124.47" color="#faf9f5">',
  )
  expect(svg).toContain('<g fill="currentColor"><path d="M0 0Z"/></g>')
  expect(svg).toContain(
    '<svg x="233.193" y="14.2" width="700" height="100" viewBox="0 -100 700 100">',
  )
  expect(svg).toContain('<defs><linearGradient id="g"/></defs><path d="M1 1Z"/>')
})

test('the lockup names the app once, without the files’ own titles and descriptions', () => {
  const svg = lockupSvg(emblem, wordmark, '#202735')
  expect(svg).toContain('role="img" aria-label="Astral Index"><title>Astral Index</title>')
  expect(svg.match(/<title/g)).toHaveLength(1)
  expect(svg).not.toContain('<desc')
  expect(svg).not.toContain('Wordmark')
  expect(svg).toContain('color="#202735"')
  expect(svg.endsWith('</svg>\n')).toBe(true)
})

test('files without a drawing or a viewBox are refused', () => {
  expect(() => lockupSvg('<svg></svg>', wordmark, '#faf9f5')).toThrow(
    'The emblem file has no drawing',
  )
  expect(() => lockupSvg(emblem, '<svg><path/></svg>', '#faf9f5')).toThrow(
    'The wordmark file has no viewBox',
  )
})
