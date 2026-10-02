import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import CachePicker from './CachePicker.vue'

const picker = (props: { id: string; disabled?: boolean }) =>
  mount(CachePicker, { props, attachTo: document.body })
function choose(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, 'files', { value: files, configurable: true })
  input.dispatchEvent(new Event('change'))
}

test('a button-styled label opens the file input, which reports the chosen file', () => {
  const wrapper = picker({ id: 'cache-file' })
  const input = wrapper.get<HTMLInputElement>('input[type="file"]').element
  expect(input.id).toBe('cache-file')
  expect(wrapper.get('label').attributes('for')).toBe('cache-file')
  expect(wrapper.get('label').text()).toBe('Choose cache file…')
  const file = new File(['synthetic'], 'data_2')
  choose(input, [file])
  expect(wrapper.emitted('choose')).toEqual([[file]])
  // A change without a file, such as a cleared selection, reports nothing.
  choose(input, [])
  expect(wrapper.emitted('choose')).toHaveLength(1)
  wrapper.unmount()
})

test('opening the dialog clears the last choice, so choosing the same file reports again', async () => {
  const wrapper = picker({ id: 'cache-file' })
  const input = wrapper.get<HTMLInputElement>('input[type="file"]')
  Object.defineProperty(input.element, 'value', { value: 'C:\\fakepath\\data_2', writable: true })
  await input.trigger('click')
  expect(input.element.value).toBe('')
  wrapper.unmount()
})

test('it can be disabled, and focused by its caller', async () => {
  const wrapper = picker({ id: 'retry-file', disabled: true })
  const input = wrapper.get<HTMLInputElement>('input').element
  expect(input.disabled).toBe(true)
  expect(wrapper.get('label').classes()).toContain('disabled')
  await wrapper.setProps({ disabled: false })
  ;(wrapper.vm as unknown as { focus: () => void }).focus()
  expect(document.activeElement).toBe(input)
  wrapper.unmount()
})
