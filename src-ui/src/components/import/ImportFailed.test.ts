import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import ImportFailed from './ImportFailed.vue'

const failed = (source: 'device' | 'file') =>
  mount(ImportFailed, {
    props: { title: 'Couldn’t Find the Game Files', message: 'We found the game.', source },
    attachTo: document.body,
  })
const button = (wrapper: ReturnType<typeof failed>, name: string) =>
  wrapper.findAll('button').find((candidate) => candidate.text() === name)

test('explains the failure as an alert, focusing its heading', () => {
  const wrapper = failed('device')
  expect(wrapper.get('[role="alert"]').text()).toContain('We found the game.')
  expect(wrapper.get('h2').text()).toBe('Couldn’t Find the Game Files')
  expect(document.activeElement).toBe(wrapper.get('h2').element)
  wrapper.unmount()
})

test('a search can be tried again, or a cache file chosen instead', async () => {
  const wrapper = failed('device')
  await button(wrapper, 'Try again')!.trigger('click')
  expect(wrapper.emitted('retry')).toHaveLength(1)
  const file = new File(['synthetic'], 'data_2')
  const input = wrapper.get<HTMLInputElement>('input[type="file"]').element
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  input.dispatchEvent(new Event('change'))
  expect(wrapper.emitted('choose')).toEqual([[file]])
  await button(wrapper, 'Back')!.trigger('click')
  expect(wrapper.emitted('back')).toHaveLength(1)
  wrapper.unmount()
})

test('a chosen file cannot be tried again as it was, so only another file is offered', () => {
  const wrapper = failed('file')
  expect(button(wrapper, 'Try again')).toBeUndefined()
  expect(wrapper.find('input[type="file"]').exists()).toBe(true)
  wrapper.unmount()
})
