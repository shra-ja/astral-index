import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import EmptyState from './EmptyState.vue'

test('says the game has no history yet, as a live status, with the caller’s action', async () => {
  const wrapper = mount(EmptyState, {
    props: { term: 'Warp', game: 'Honkai: Star Rail' },
    slots: { default: '<a href="#/somewhere">Go to Import</a>' },
  })
  const status = wrapper.get('[role="status"]')
  expect(status.attributes()).toEqual(
    expect.objectContaining({ 'aria-live': 'polite', 'aria-atomic': 'true' }),
  )
  expect(wrapper.get('h2').text()).toBe('No Warp History Yet')
  expect(wrapper.text()).toContain(
    'Import your Honkai: Star Rail history to see every warp here. Nothing is downloaded until you choose to retrieve it.',
  )
  expect(wrapper.get('a').text()).toBe('Go to Import')
  expect(wrapper.text()).not.toMatch(/pity|guarantee|win rate/i)
  await wrapper.setProps({ term: 'Wish', game: 'Genshin Impact' })
  expect(wrapper.get('h2').text()).toBe('No Wish History Yet')
  expect(wrapper.text()).toContain('see every wish here')
})
