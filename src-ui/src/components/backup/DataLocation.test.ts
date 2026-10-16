import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import DataLocation from './DataLocation.vue'

test('names the history file and asks to show it in its folder', async () => {
  const wrapper = mount(DataLocation, {
    props: { folder: '/local/astral-index', failed: false },
  })
  expect(wrapper.get('.label').text()).toBe('History is stored in')
  expect(wrapper.get('.path').text()).toBe('/local/astral-index/history.sqlite')
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  await wrapper.get('button').trigger('click')
  expect(wrapper.emitted('reveal')).toHaveLength(1)
  // A failed opening keeps the path on screen and says so.
  await wrapper.setProps({ failed: true })
  expect(wrapper.get('[role="alert"]').text()).toBe(
    'The folder couldn’t be opened. Its path is shown above.',
  )
})

test('without a data folder there is nothing to show', () => {
  const wrapper = mount(DataLocation, { props: { folder: null, failed: false } })
  expect(wrapper.find('.path').exists()).toBe(false)
  expect(wrapper.find('button').exists()).toBe(false)
  expect(wrapper.text()).toBe('No data folder is available on this device.')
})
