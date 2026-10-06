import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import RollSearch from './RollSearch.vue'

test('a labelled search box that reports each change as typed', async () => {
  const wrapper = mount(RollSearch, { props: { query: 'Ar' }, attachTo: document.body })
  const input = wrapper.get('input')
  expect(input.attributes('type')).toBe('search')
  expect(input.attributes('placeholder')).toBe('Search items')
  expect((input.element as HTMLInputElement).value).toBe('Ar')
  // The label names the box for screen readers.
  expect(wrapper.get('label').text()).toBe('Search items')
  expect(wrapper.get('label').attributes('for')).toBe(input.attributes('id'))
  await input.setValue('Arr')
  expect(wrapper.emitted('search')).toEqual([['Arr']])
  wrapper.unmount()
})
