import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import HistoryFailed from './HistoryFailed.vue'

test('explains the failure as an alert and offers to try again', async () => {
  const wrapper = mount(HistoryFailed, {
    props: { title: 'Couldn’t Show Your Warp History', message: 'Something went wrong.' },
    attachTo: document.body,
  })
  expect(wrapper.get('[role="alert"]').text()).toContain('Something went wrong.')
  expect(wrapper.get('h2').text()).toBe('Couldn’t Show Your Warp History')
  expect(document.activeElement).toBe(wrapper.get('h2').element)
  await wrapper.get('button').trigger('click')
  expect(wrapper.emitted('retry')).toHaveLength(1)
  wrapper.unmount()
})
