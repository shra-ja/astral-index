import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import FailureSummary from './FailureSummary.vue'

test('names the failure beside a warning, focusing its heading so it is read in full', () => {
  const wrapper = mount(FailureSummary, {
    props: { id: 'failed-heading', title: 'Couldn’t Find the Game Files' },
    slots: { default: '<p>We found the game.</p>' },
    attachTo: document.body,
  })
  const heading = wrapper.get('h2#failed-heading')
  expect(heading.text()).toBe('Couldn’t Find the Game Files')
  expect(heading.attributes('tabindex')).toBe('-1')
  expect(document.activeElement).toBe(heading.element)
  expect(wrapper.get('h2 + p').text()).toBe('We found the game.')
  const icon = wrapper.get('.icon')
  expect(icon.attributes('aria-hidden')).toBe('true')
  expect(icon.find('svg').exists()).toBe(true)
  wrapper.unmount()
})
