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
  await wrapper.get('#retry-cache-file').trigger('click')
  expect(wrapper.emitted('choose')).toEqual([[]])
  await button(wrapper, 'Back')!.trigger('click')
  expect(wrapper.emitted('back')).toHaveLength(1)
  wrapper.unmount()
})

test('a chosen file cannot be tried again as it was, so only another file is offered', () => {
  const wrapper = failed('file')
  expect(button(wrapper, 'Try again')).toBeUndefined()
  expect(wrapper.find('#retry-cache-file').exists()).toBe(true)
  wrapper.unmount()
})
