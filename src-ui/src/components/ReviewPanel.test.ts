import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import ReviewPanel from './ReviewPanel.vue'
import type { Review } from '../commands'

type Conflict = Review['conflicts'][number]
// A synthetic review with every count in Stellar Warp.
const review = (inserted: number, conflicts: Conflict[] = []): Review => ({
  uid: '100000001',
  server: 'synthetic-server',
  timezone: 8,
  summary: { inserted, duplicates: 3, conflicts: conflicts.length },
  categories: ['1', '2', '11', '12', '21', '22'].map((gacha_type, index) =>
    index === 0
      ? { gacha_type, inserted, duplicates: 3, conflicts: conflicts.length }
      : { gacha_type, inserted: 0, duplicates: 0, conflicts: 0 },
  ),
  earliest: '2026-04-02 10:00:00',
  latest: '2026-09-28 21:30:00',
  conflicts,
})
const panel = (props: { review: Review; busy?: boolean }) =>
  mount(ReviewPanel, { props: { busy: false, ...props } })
const button = (wrapper: ReturnType<typeof panel>, name: string) =>
  wrapper.findAll('button').find((candidate) => candidate.text() === name)!

test('a review shows the account, dates and counts for every warp', () => {
  const wrapper = panel({ review: review(412) })
  expect(wrapper.get('h3').text()).toBe('Ready to save 412 new rolls')
  expect(wrapper.get('h3').attributes('tabindex')).toBe('-1')
  expect(wrapper.text()).toContain(
    'UID 100000001 · synthetic-server · 2026-04-02 to 2026-09-28 (server time)',
  )
  expect(wrapper.findAll('thead th').map((cell) => cell.text())).toEqual([
    'Warp',
    'New',
    'Already saved',
    'Conflicts',
  ])
  expect(
    wrapper.findAll('tbody tr').map((row) => row.findAll('th, td').map((cell) => cell.text())),
  ).toEqual([
    ['Stellar Warp', '412', '3', '0'],
    ['Departure Warp', '0', '0', '0'],
    ['Character Event Warp', '0', '0', '0'],
    ['Light Cone Event Warp', '0', '0', '0'],
    ['Character Collaboration Warp', '0', '0', '0'],
    ['Light Cone Collaboration Warp', '0', '0', '0'],
  ])
  expect(wrapper.get('tbody th').attributes('scope')).toBe('row')
  expect(wrapper.get('.conflicts').attributes('hidden')).toBeDefined()
  expect(
    panel({ review: review(1) })
      .get('h3')
      .text(),
  ).toBe('Ready to save 1 new roll')
})

test('Save and Discard emit, and are disabled while busy', async () => {
  const wrapper = panel({ review: review(2) })
  expect(button(wrapper, 'Done').attributes('hidden')).toBeDefined()
  await button(wrapper, 'Save to this device').trigger('click')
  await button(wrapper, 'Discard').trigger('click')
  expect(Object.keys(wrapper.emitted())).toEqual(expect.arrayContaining(['save', 'discard']))
  await wrapper.setProps({ busy: true })
  expect(button(wrapper, 'Save to this device').attributes('disabled')).toBeDefined()
  expect(button(wrapper, 'Discard').attributes('disabled')).toBeDefined()
})

test('when nothing is new, only Done is offered', async () => {
  const wrapper = panel({ review: review(0) })
  expect(wrapper.get('h3').text()).toBe('Everything here is already saved')
  expect(button(wrapper, 'Save to this device').attributes('hidden')).toBeDefined()
  expect(button(wrapper, 'Discard').attributes('hidden')).toBeDefined()
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
  expect(wrapper.get('h3').text()).toBe('Some rolls conflict with your saved history')
  const conflicts = wrapper.get('.conflicts')
  expect(conflicts.attributes('hidden')).toBeUndefined()
  expect(conflicts.text()).toContain(
    'differ from saved rolls with the same ID, so nothing can be saved',
  )
  expect(conflicts.findAll('li').map((item) => item.text())).toEqual([
    'Character Event Warp · 2026-05-01 12:00:00 · ID 1000000000000000001',
  ])
  const save = button(wrapper, 'Save to this device')
  expect(save.attributes('disabled')).toBeDefined()
  expect(save.attributes('aria-describedby')).toBe(conflicts.get('p').attributes('id'))
  expect(button(wrapper, 'Save to this device').attributes('hidden')).toBeUndefined()
})

test('the review moves focus to its heading as it appears, so it is announced', () => {
  const wrapper = mount(ReviewPanel, {
    props: { review: review(3), busy: false },
    attachTo: document.body,
  })
  expect(document.activeElement).toBe(wrapper.get('h3').element)
  wrapper.unmount()
})
