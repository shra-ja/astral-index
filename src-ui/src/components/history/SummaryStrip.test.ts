import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import SummaryStrip from './SummaryStrip.vue'

const tiles = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findAll('.tile').map((tile) => ({
    label: tile.get('.label').text(),
    value: tile.get('.value').text(),
    rate: tile.find('.rate').exists() ? tile.get('.rate').text() : undefined,
  }))

test('summarises the whole category: rolls, 5★ and 4★ counts with rates, and the period', () => {
  const wrapper = mount(SummaryStrip, {
    props: {
      total: 1284,
      summary: {
        five_star: 19,
        four_star: 162,
        first: '2023-04-26 10:00:00',
        last: '2026-09-28 21:14:03',
      },
    },
  })
  expect(wrapper.get('section').attributes('aria-label')).toBe('Category summary')
  expect(tiles(wrapper)).toEqual([
    { label: 'Rolls stored', value: '1,284', rate: undefined },
    { label: '5★ rolls', value: '19', rate: '1.48%' },
    { label: '4★ rolls', value: '162', rate: '12.62%' },
    { label: 'Stored period', value: '26 Apr 2023 – 28 Sep 2026', rate: undefined },
  ])
  // The period only breaks at its dash.
  expect(wrapper.findAll('.period > span').map((part) => part.text())).toEqual([
    '26 Apr 2023 –',
    '28 Sep 2026',
  ])
  // Rarity is named in text as well as colour.
  expect(wrapper.get('.five').classes()).toContain('value')
  expect(wrapper.get('.four').classes()).toContain('value')
})

test('a category without rolls shows zeros, no rates and no period yet', () => {
  const wrapper = mount(SummaryStrip, {
    props: { total: 0, summary: { five_star: 0, four_star: 0, first: null, last: null } },
  })
  expect(tiles(wrapper)).toEqual([
    { label: 'Rolls stored', value: '0', rate: undefined },
    { label: '5★ rolls', value: '0', rate: undefined },
    { label: '4★ rolls', value: '0', rate: undefined },
    { label: 'Stored period', value: 'None yet', rate: undefined },
  ])
})
