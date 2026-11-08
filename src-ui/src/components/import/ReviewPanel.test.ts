import { mount } from '@vue/test-utils'
import { afterEach, expect, test, vi } from 'vitest'
import ReviewPanel from './ReviewPanel.vue'
import type { Review } from '../../commands'

// jsdom has no layout: a test sets the widths the figures measure, then reports a
// resize as the browser would.
let resized: () => void
vi.stubGlobal(
  'ResizeObserver',
  class {
    constructor(callback: () => void) {
      resized = callback
    }
    observe() {}
    disconnect() {}
  },
)
afterEach(() => vi.clearAllMocks())

type Conflict = Review['conflicts'][number]
// A synthetic review with every count in Stellar Warp.
const review = (inserted: number, conflicts: Conflict[] = [], pool_ids_added = 0): Review => ({
  uid: '100000001',
  server: 'synthetic-server',
  timezone: 8,
  summary: { inserted, duplicates: 3, conflicts: conflicts.length, pool_ids_added },
  new_five_star: 0,
  new_four_star: 0,
  categories: ['1', '2', '11', '12', '21', '22'].map((gacha_type, index) =>
    index === 0
      ? { gacha_type, inserted, duplicates: 3, conflicts: conflicts.length, pool_ids_added: 0 }
      : { gacha_type, inserted: 0, duplicates: 0, conflicts: 0, pool_ids_added: 0 },
  ),
  earliest: '2026-04-02 10:00:00',
  latest: '2026-09-28 21:30:00',
  conflicts,
})
const panel = (props: { review: Review; busy?: boolean; fileName?: string }) =>
  mount(ReviewPanel, { props: { busy: false, ...props } })
const button = (wrapper: ReturnType<typeof panel>, name: string) =>
  wrapper.findAll('button').find((candidate) => candidate.text() === name)!

test('the review names a known server as the game does', () => {
  const wrapper = panel({ review: { ...review(412), server: 'prod_official_usa' } })
  expect(wrapper.get('.account .chip').text()).toBe('America')
})

test('a review shows the account, a summary, the period and counts for every warp', () => {
  const wrapper = panel({ review: review(412) })
  expect(wrapper.get('h2').text()).toBe('Ready to save 412 new rolls')
  expect(wrapper.get('h2').attributes('tabindex')).toBe('-1')
  expect(wrapper.findAll('.account span').map((part) => part.text())).toEqual([
    'Account',
    'UID 100000001',
    'synthetic-server',
  ])
  expect(
    wrapper
      .findAll('.stats:not(.measure *) .stat')
      .map((stat) => [stat.get('.stat-label').text(), stat.get('.stat-value').text()]),
  ).toEqual([
    ['New rolls', '412'],
    ['Existing rolls skipped', '3'],
    ['Conflicts', '0'],
    ['Retrieved period', '2 Apr 2026 – 28 Sep 2026'],
  ])
  expect(wrapper.text()).toContain('Times are server time.')
  expect(wrapper.findAll('thead th').map((cell) => cell.text())).toEqual([
    'Category',
    'New',
    'Skipped',
  ])
  expect(
    wrapper.findAll('tbody tr').map((row) => row.findAll('th, td').map((cell) => cell.text())),
  ).toEqual([
    ['Stellar Warp', '412', '3'],
    ['Departure Warp', '0', '0'],
    ['Character Event Warp', '0', '0'],
    ['Light Cone Event Warp', '0', '0'],
    ['Character Collaboration Warp', '0', '0'],
    ['Light Cone Collaboration Warp', '0', '0'],
  ])
  expect(wrapper.get('tbody th').attributes('scope')).toBe('row')
  expect(wrapper.find('.conflicts').exists()).toBe(false)
  expect(wrapper.text()).toContain('Saving adds 412 rolls. Rolls already saved are never changed.')
  expect(
    panel({ review: review(1) })
      .get('h2')
      .text(),
  ).toBe('Ready to save 1 new roll')
})

test('a file’s review names the file and the period it holds', () => {
  const wrapper = panel({ review: review(412), fileName: 'export.json' })
  expect(wrapper.findAll('.account span').map((part) => part.text())).toEqual([
    'Account',
    'UID 100000001',
    'synthetic-server',
    'from export.json',
  ])
  expect(wrapper.findAll('.stat-label').map((label) => label.text())).toContain('Period in file')
  expect(wrapper.findAll('.stat-label').map((label) => label.text())).not.toContain(
    'Retrieved period',
  )
})

test('banners that skipped rolls give to saved rolls are counted, and saving says so', () => {
  const wrapper = panel({ review: review(2, [], 96) })
  expect(wrapper.get('h2').text()).toBe('Ready to save 2 new rolls')
  expect(wrapper.get('.banners').text()).toBe(
    '96 of the skipped rolls also add their banner to saved rolls that lacked it.',
  )
  expect(wrapper.get('.footnote').text()).toBe(
    'Saving adds 2 rolls and 96 banners. Rolls already saved are never changed otherwise.',
  )
  const one = panel({ review: review(2, [], 1) })
  expect(one.get('.banners').text()).toBe(
    '1 of the skipped rolls also adds its banner to a saved roll that lacked it.',
  )
  expect(one.get('.footnote').text()).toBe(
    'Saving adds 2 rolls and 1 banner. Rolls already saved are never changed otherwise.',
  )
  expect(
    panel({ review: review(2) })
      .find('.banners')
      .exists(),
  ).toBe(false)
})

test('a review that only adds banners can still be saved', async () => {
  const wrapper = panel({ review: review(0, [], 12) })
  expect(wrapper.get('h2').text()).toBe('Banners to add to 12 saved rolls')
  expect(wrapper.get('.banners').text()).toBe(
    'These rolls are already saved, but 12 of them lack their banner, which saving adds.',
  )
  expect(wrapper.get('.footnote').text()).toBe(
    'No new rolls. Saving adds banners only; nothing else changes.',
  )
  expect(button(wrapper, 'Done')).toBeUndefined()
  await button(wrapper, 'Save banners').trigger('click')
  await button(wrapper, 'Discard').trigger('click')
  expect(Object.keys(wrapper.emitted())).toEqual(expect.arrayContaining(['save', 'discard']))
  const one = panel({ review: review(0, [], 1) })
  expect(one.get('h2').text()).toBe('Banner to add to 1 saved roll')
  expect(one.get('.banners').text()).toBe(
    'These rolls are already saved, but 1 of them lacks its banner, which saving adds.',
  )
  expect(button(one, 'Save banner')).toBeDefined()
})

test('Save and Discard emit, and are disabled while busy', async () => {
  const wrapper = panel({ review: review(2) })
  expect(button(wrapper, 'Done')).toBeUndefined()
  await button(wrapper, 'Save 2 rolls').trigger('click')
  await button(wrapper, 'Discard').trigger('click')
  expect(Object.keys(wrapper.emitted())).toEqual(expect.arrayContaining(['save', 'discard']))
  await wrapper.setProps({ busy: true })
  expect(button(wrapper, 'Save 2 rolls').attributes('disabled')).toBeDefined()
  expect(button(wrapper, 'Discard').attributes('disabled')).toBeDefined()
})

test('when nothing is new, only Done is offered', async () => {
  const wrapper = panel({ review: review(0) })
  expect(wrapper.get('h2').text()).toBe('Everything here is already saved')
  expect(wrapper.text()).toContain(
    'Nothing new to save. Your saved history already has these rolls.',
  )
  expect(button(wrapper, 'Save 0 rolls')).toBeUndefined()
  expect(button(wrapper, 'Discard')).toBeUndefined()
  await button(wrapper, 'Done').trigger('click')
  expect(wrapper.emitted('done')).toHaveLength(1)
  await wrapper.setProps({ busy: true })
  expect(button(wrapper, 'Done').attributes('disabled')).toBeDefined()
})

test('conflicts are listed, and Save is disabled and described by the explanation', () => {
  const wrapper = panel({
    review: review(2, [
      { id: '1000000000000000001', gacha_type: '11', time: '2026-05-01 12:00:00' },
    ]),
  })
  expect(wrapper.get('h2').text()).toBe('Some rolls conflict with your saved history')
  const conflicts = wrapper.get('.conflicts')
  expect(conflicts.text()).toContain(
    'differ from saved rolls with the same ID, so nothing can be saved',
  )
  expect(conflicts.findAll('li').map((item) => item.text())).toEqual([
    'Character Event Warp · 2026-05-01 12:00:00 · ID 1000000000000000001',
  ])
  const save = button(wrapper, 'Save 2 rolls')
  expect(save.attributes('disabled')).toBeDefined()
  expect(save.attributes('aria-describedby')).toBe(conflicts.get('p').attributes('id'))
  // A file's rolls are named as the file's.
  const file = panel({
    review: review(2, [{ id: '1', gacha_type: '1', time: '2026-05-01 12:00:00' }]),
    fileName: 'export.json',
  })
  expect(file.get('.conflicts p').text()).toBe(
    'These rolls from the file differ from saved rolls with the same ID, so nothing can be saved. Discarding them leaves this device unchanged.',
  )
})

test('the review moves focus to its heading as it appears, so it is announced', () => {
  const wrapper = mount(ReviewPanel, {
    props: { review: review(3), busy: false },
    attachTo: document.body,
  })
  expect(document.activeElement).toBe(wrapper.get('h2').element)
  wrapper.unmount()
})

test('the figures keep to one row while every label and value fits, else two by two', async () => {
  const disconnect = vi.spyOn(ResizeObserver.prototype, 'disconnect')
  const wrapper = panel({ review: review(412) })
  // A hidden copy, laid out as narrow as one row can be, holds the same figures.
  expect(wrapper.findAll('.measure .stat').map((stat) => stat.text())).toEqual(
    wrapper.findAll('.stats:not(.measure *) .stat').map((stat) => stat.text()),
  )
  const layout = async (shown: number, needed: number) => {
    const width = (selector: string, property: string, value: number) =>
      Object.defineProperty(wrapper.get(selector).element, property, {
        value,
        configurable: true,
      })
    width('.stats:not(.measure *)', 'clientWidth', shown)
    width('.measure .stats', 'offsetWidth', needed)
    resized()
    await wrapper.vm.$nextTick()
  }
  const square = () => wrapper.get('.stats:not(.measure *)').classes().includes('square')
  await layout(720, 720)
  expect(square()).toBe(false)
  await layout(719, 720)
  expect(square()).toBe(true)
  wrapper.unmount()
  expect(disconnect).toHaveBeenCalled()
})
