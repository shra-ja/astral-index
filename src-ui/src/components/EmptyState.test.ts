import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import EmptyState from './EmptyState.vue'

test('says the game has no rolls yet, as a live status, and keeps history local', async () => {
  const wrapper = mount(EmptyState, { props: { game: 'Genshin Impact' } })
  const status = wrapper.get('[role="status"]')
  expect(status.attributes()).toEqual(
    expect.objectContaining({ 'aria-live': 'polite', 'aria-atomic': 'true' }),
  )
  expect(wrapper.get('h2').text()).toBe('No Genshin Impact rolls yet')
  expect(wrapper.text()).toContain('Showing saved history is coming next.')
  expect(wrapper.text()).toContain('Your history will stay on this device. No account needed.')
  expect(wrapper.text()).not.toMatch(/pity|guarantee|win rate/i)
  await wrapper.setProps({ game: 'Honkai: Star Rail' })
  expect(wrapper.get('h2').text()).toBe('No Honkai: Star Rail rolls yet')
})
