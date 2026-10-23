import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import StatusCard from './StatusCard.vue'

test('frames its content as a section, named and announced as its caller says', () => {
  const wrapper = mount(StatusCard, {
    attrs: { role: 'alert', 'aria-labelledby': 'card-heading' },
    slots: { default: '<h2 id="card-heading">Saved</h2><p>Done.</p>' },
  })
  const section = wrapper.get('section')
  expect(section.attributes('role')).toBe('alert')
  expect(section.attributes('aria-labelledby')).toBe('card-heading')
  expect(section.get('h2 + p').text()).toBe('Done.')
  expect(section.classes()).not.toContain('centred')
})

test('a result can be centred', () => {
  const wrapper = mount(StatusCard, { props: { centred: true } })
  expect(wrapper.get('section').classes()).toContain('centred')
})
