import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import CachePicker from './CachePicker.vue'

const picker = (props: { id: string; disabled?: boolean }) =>
  mount(CachePicker, { props, attachTo: document.body })

test('a button asks for the cache file; the native side opens the dialog', async () => {
  const wrapper = picker({ id: 'cache-file' })
  const button = wrapper.get('button')
  expect(button.attributes('id')).toBe('cache-file')
  expect(button.attributes('type')).toBe('button')
  expect(button.text()).toBe('Choose cache file…')
  // No file input: the webview never reads the file.
  expect(wrapper.find('input').exists()).toBe(false)
  await button.trigger('click')
  expect(wrapper.emitted('choose')).toEqual([[]])
  wrapper.unmount()
})

test('it can be disabled, and focused by its caller', async () => {
  const wrapper = picker({ id: 'retry-cache-file', disabled: true })
  const button = wrapper.get<HTMLButtonElement>('button').element
  expect(button.disabled).toBe(true)
  await wrapper.setProps({ disabled: false })
  ;(wrapper.vm as unknown as { focus: () => void }).focus()
  expect(document.activeElement).toBe(button)
  wrapper.unmount()
})
