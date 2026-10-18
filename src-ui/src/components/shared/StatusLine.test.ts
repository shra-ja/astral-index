import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import StatusLine from './StatusLine.vue'

test('shows its message after an icon for its tone', async () => {
  const wrapper = mount(StatusLine, {
    props: { tone: 'done' },
    slots: { default: 'Saved <span class="name">backup.sqlite</span>' },
  })
  expect(wrapper.text()).toBe('Saved backup.sqlite')
  expect(wrapper.classes()).toEqual(['status-line', 'done'])
  expect(wrapper.find('svg').classes()).toContain('lucide-check')
  expect(wrapper.find('svg').attributes('aria-hidden')).toBe('true')
  await wrapper.setProps({ tone: 'failed' })
  expect(wrapper.classes()).toEqual(['status-line', 'failed'])
  expect(wrapper.find('svg').classes()).toContain('lucide-circle-alert')
})
