import { mount } from '@vue/test-utils'
import { afterEach, expect, test } from 'vitest'
import RollIcons from './RollIcons.vue'

const roll = (number: number, name: string, rank_type: string, pity = number) => ({
  number,
  pity,
  id: String(1000 + number),
  name,
  item_type: 'Light Cone',
  rank_type,
  time: '2026-09-28 21:14:03',
})
const rolls = [
  roll(7, 'Synthetic Hero', '5', 78),
  roll(6, 'Synthetic Cone', '4'),
  roll(5, 'Arrows', '3'),
  roll(4, 'Loop', '3'),
  roll(3, 'Defense', '3'),
  roll(2, 'Darkness', '3'),
  roll(1, 'Cornucopia', '3'),
]
let wrapper: ReturnType<typeof render>
const render = (
  shown = rolls,
  softPity: { near: number; soft: number } | null = { near: 49, soft: 74 },
) =>
  mount(RollIcons, {
    props: { rolls: shown, caption: 'Character Event Warp rolls, newest first', softPity },
    attachTo: document.body,
  })
afterEach(() => wrapper.unmount())

const tiles = () => wrapper.findAll('[role="img"]')
const focused = () => tiles().findIndex((tile) => tile.element === document.activeElement)
// Three tiles to a row, as the browser would lay them out.
function rowsOfThree() {
  tiles().forEach((tile, index) =>
    Object.defineProperty(tile.element, 'offsetTop', { value: Math.floor(index / 3) * 74 }),
  )
}
const press = async (key: string) => {
  await tiles()[focused()].trigger('keydown', { key })
}

test('shows each roll as an icon with its pity, named for assistive technology and in a tooltip', () => {
  wrapper = render()
  expect(wrapper.get('ul').attributes('aria-label')).toBe(
    'Character Event Warp rolls, newest first',
  )
  expect(tiles()[0].attributes('aria-label')).toBe('Synthetic Hero, 5★, pity 78, #7, 28 Sep 2026')
  expect(tiles()[1].attributes('aria-label')).toBe('Synthetic Cone, 4★, pity 6, #6, 28 Sep 2026')
  expect(wrapper.findAll('[role="tooltip"]').map((tip) => tip.text())).toEqual(
    tiles().map((tile) => tile.attributes('aria-label')),
  )
  expect(tiles().map((tile) => [tile.get('.icon').text(), tile.get('.pity').text()])).toEqual([
    ['SH', '78'],
    ['SC', '6'],
    ['A', '5'],
    ['L', '4'],
    ['D', '3'],
    ['D', '2'],
    ['C', '1'],
  ])
})

test('colours 5★ pity by the soft-pity thresholds, leaving the rest and unknown thresholds plain', () => {
  wrapper = render()
  const bands = () =>
    wrapper.findAll('.pity').map((pity) => pity.classes().find((name) => name.startsWith('band-')))
  expect(bands()).toEqual(['band-soft', ...Array(6).fill(undefined)])
  wrapper.unmount()
  wrapper = render(rolls, null)
  expect(bands().every((band) => band === undefined)).toBe(true)
})

test('the tiles are one Tab stop; arrows move by tile and row, and Home and End jump', async () => {
  wrapper = render()
  rowsOfThree()
  expect(tiles().map((tile) => tile.attributes('tabindex'))).toEqual(['0', ...Array(6).fill('-1')])
  ;(tiles()[0].element as HTMLElement).focus()
  await press('ArrowRight')
  expect(focused()).toBe(1)
  expect(tiles().map((tile) => tile.attributes('tabindex'))).toEqual([
    '-1',
    '0',
    ...Array(5).fill('-1'),
  ])
  await press('ArrowDown')
  expect(focused()).toBe(4)
  await press('ArrowLeft')
  expect(focused()).toBe(3)
  await press('ArrowUp')
  expect(focused()).toBe(0)
  await press('End')
  expect(focused()).toBe(6)
  // A short last row: down onto a gap lands on the last tile.
  await press('Home')
  await press('ArrowRight')
  await press('ArrowDown')
  expect(focused()).toBe(4)
  await press('ArrowDown')
  expect(focused()).toBe(6)
  await press('Home')
  expect(focused()).toBe(0)
})

test('arrows stop at the edges, and other keys are left alone', async () => {
  wrapper = render()
  rowsOfThree()
  ;(tiles()[0].element as HTMLElement).focus()
  await press('ArrowLeft')
  await press('ArrowUp')
  expect(focused()).toBe(0)
  await press('End')
  await press('ArrowRight')
  await press('ArrowDown')
  expect(focused()).toBe(6)
  const event = new KeyboardEvent('keydown', { key: 'a', cancelable: true })
  tiles()[6].element.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(false)
})

test('a new page of rolls makes its first tile the Tab stop again', async () => {
  wrapper = render()
  ;(tiles()[0].element as HTMLElement).focus()
  await press('End')
  await wrapper.setProps({ rolls: rolls.slice(0, 2) })
  expect(tiles().map((tile) => tile.attributes('tabindex'))).toEqual(['0', '-1'])
})
