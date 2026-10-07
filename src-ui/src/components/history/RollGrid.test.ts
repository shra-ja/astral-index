import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import RollGrid from './RollGrid.vue'

const roll = (
  number: number,
  name: string,
  rank_type: string,
  item_type: string,
  pity = number,
) => ({
  number,
  pity,
  id: String(1000 + number),
  name,
  item_type,
  rank_type,
  time: '2026-09-28 21:14:03',
})
const rolls = [
  roll(3, 'Synthetic Hero', '5', 'Character', 78),
  roll(2, 'Synthetic Cone', '4', 'Light Cone'),
  roll(1, 'Arrows', '3', 'Light Cone'),
]
const softPity = { near: 49, soft: 74 }

test('shows each roll as a tile: icon, name, type and number, rarity, pity and date', () => {
  const wrapper = mount(RollGrid, {
    props: { rolls, caption: 'Character Event Warp rolls, newest first', softPity },
  })
  const list = wrapper.get('ul')
  expect(list.attributes('aria-label')).toBe('Character Event Warp rolls, newest first')
  const tiles = list.findAll('li')
  expect(
    tiles.map((tile) =>
      ['.icon', '.name', '.detail', '.badge', '.pity', '.date'].map((part) =>
        tile.get(part).text(),
      ),
    ),
  ).toEqual([
    ['SH', 'Synthetic Hero', 'Character · #3', '5★', 'Pity 78', '28 Sep 2026'],
    ['SC', 'Synthetic Cone', 'Light Cone · #2', '4★', 'Pity 2', '28 Sep 2026'],
    ['A', 'Arrows', 'Light Cone · #1', '3★', 'Pity 1', '28 Sep 2026'],
  ])
  // The placeholder icon is decorative; the name is the tile's text.
  expect(tiles[0].get('.icon').attributes('aria-hidden')).toBe('true')
  expect(tiles.map((tile) => tile.classes().find((name) => name.startsWith('rarity-')))).toEqual([
    'rarity-5',
    'rarity-4',
    'rarity-3',
  ])
})

test('colours 5★ pity by the soft-pity thresholds, leaving the rest and unknown thresholds plain', () => {
  const banded = mount(RollGrid, {
    props: {
      rolls: [
        roll(9, 'Soft', '5', 'Character', 74),
        roll(8, 'Near', '5', 'Character', 49),
        ...rolls,
      ],
      caption: 'Rolls',
      softPity,
    },
  })
  expect(
    banded.findAll('.pity').map((pity) => pity.classes().find((name) => name.startsWith('band-'))),
  ).toEqual(['band-soft', 'band-near', 'band-soft', undefined, undefined])
  const plain = mount(RollGrid, { props: { rolls, caption: 'Rolls' } })
  expect(
    plain.findAll('.pity').some((pity) => pity.classes().some((name) => name.startsWith('band-'))),
  ).toBe(false)
})
