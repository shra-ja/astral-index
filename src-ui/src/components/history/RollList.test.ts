import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import RollList from './RollList.vue'

// A cell's text as assistive technology reads it, without decorative parts.
function spoken(cell: Element) {
  const copy = cell.cloneNode(true) as Element
  copy.querySelectorAll('[aria-hidden="true"]').forEach((hidden) => hidden.remove())
  return copy.textContent?.trim()
}
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

test('lists rolls newest first with number, item, pity, rarity, type and server time', () => {
  const wrapper = mount(RollList, {
    props: {
      rolls: [
        roll(3, 'Synthetic Hero', '5', 'Character', 78),
        roll(2, 'Synthetic Cone', '4', 'Light Cone'),
        roll(1, 'Arrows', '3', 'Light Cone'),
      ],
      offset: 'UTC+8',
      caption: 'Character Event Warp rolls, newest first',
    },
  })
  const table = wrapper.get('[role="table"]')
  expect(table.attributes('aria-label')).toBe('Character Event Warp rolls, newest first')
  expect(wrapper.findAll('[role="columnheader"]').map((header) => header.text())).toEqual([
    '#',
    'Item',
    'Pity',
    'Rarity',
    'Type',
    'Time (UTC+8)',
  ])
  expect(wrapper.get('[aria-sort]').text()).toBe('Time (UTC+8)')
  expect(wrapper.get('[aria-sort]').attributes('aria-sort')).toBe('descending')
  const rows = wrapper.findAll('.body [role="row"]')
  expect(
    rows.map((row) => row.findAll('[role="cell"]').map((cell) => spoken(cell.element))),
  ).toEqual([
    ['3', 'Synthetic Hero', '78', '5★', 'Character', '28 Sep 2026, 21:14:03'],
    ['2', 'Synthetic Cone', '2', '4★', 'Light Cone', '28 Sep 2026, 21:14:03'],
    ['1', 'Arrows', '1', '3★', 'Light Cone', '28 Sep 2026, 21:14:03'],
  ])
  // Rarity is in the text as well as the colour; the icon is decoration.
  expect(rows.map((row) => row.classes().find((name) => name.startsWith('rarity-')))).toEqual([
    'rarity-5',
    'rarity-4',
    'rarity-3',
  ])
  expect(rows.map((row) => row.get('.icon').text())).toEqual(['SH', 'SC', 'A'])
})

test('5★ pity is coloured by the category’s soft pity, and every pity cell reads its count only', () => {
  const wrapper = mount(RollList, {
    props: {
      rolls: [
        roll(4, 'Late Hero', '5', 'Character', 80),
        roll(3, 'Near Hero', '5', 'Character', 60),
        roll(2, 'Early Hero', '5', 'Character', 10),
        roll(1, 'Arrows', '3', 'Light Cone', 80),
      ],
      offset: 'UTC+8',
      caption: 'rolls',
      softPity: { near: 49, soft: 74 },
    },
  })
  const pity = wrapper.findAll('.body .pity')
  expect(pity.map((cell) => cell.classes().find((name) => name.startsWith('band-')))).toEqual([
    'band-soft',
    'band-near',
    'band-early',
    undefined,
  ])
  // The colour is a convenience; well-known thresholds aren't read out.
  expect(pity.map((cell) => cell.text())).toEqual(['80', '60', '10', '80'])
  // Without known soft pity, as on Departure Warp, 5★ pity is plain too.
  const plain = mount(RollList, {
    props: { rolls: [roll(1, 'Hero', '5', 'Character', 40)], offset: 'UTC+8', caption: 'rolls' },
  })
  expect(plain.get('.body .pity').text()).toBe('40')
})
