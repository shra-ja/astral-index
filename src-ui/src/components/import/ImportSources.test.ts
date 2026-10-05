import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import type { Mode } from '../../commands'
import ImportSources from './ImportSources.vue'

type Props = { term: string; game: string; available: boolean; note?: string; mode?: Mode }
const sources = (props: Props) =>
  mount(ImportSources, { props: { mode: 'new', ...props }, attachTo: document.body })
const button = (wrapper: ReturnType<typeof sources>, name: string) =>
  wrapper.findAll('button').find((candidate) => candidate.text() === name)!
const retrieve = (wrapper: ReturnType<typeof sources>) => button(wrapper, 'Retrieve history')

test('offers retrieval from HoYoverse, by search or a chosen cache file', async () => {
  const wrapper = sources({ term: 'Warp', game: 'Honkai: Star Rail', available: true })
  expect(wrapper.get('h2').text()).toBe('Add Warp History')
  expect(wrapper.get('.intro p').text()).toBe(
    'Choose where to import roll history from. You will see a summary before anything is saved.',
  )
  expect(wrapper.findAll('h3').map((heading) => heading.text())).toEqual([
    'Retrieve from HoYoverse',
    'Import from a file',
  ])
  expect(wrapper.text()).toContain(
    'Finds the warp history link in the game’s local files, then downloads your roll history from HoYoverse.',
  )
  expect(wrapper.text()).toContain('choose its data_2 cache file yourself')
  await retrieve(wrapper).trigger('click')
  expect(wrapper.emitted('search')).toHaveLength(1)
  const file = new File(['synthetic'], 'data_2')
  const input = wrapper.get<HTMLInputElement>('#cache-file').element
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  input.dispatchEvent(new Event('change'))
  expect(wrapper.emitted('choose')).toEqual([[file]])
  expect(wrapper.find('.note').exists()).toBe(false)
  wrapper.unmount()
})

test('file import is shown as coming soon', () => {
  const wrapper = sources({ term: 'Warp', game: 'Honkai: Star Rail', available: true })
  const fileImport = button(wrapper, 'Choose file…')
  expect(fileImport.attributes('disabled')).toBeDefined()
  expect(wrapper.get(`#${fileImport.attributes('aria-describedby')}`).text()).toBe('Coming soon')
  expect(wrapper.text()).toContain('Load an export from another tracker or an Astral Index backup.')
  wrapper.unmount()
})

test('without retrieval for the game, its controls are disabled and say so', () => {
  const wrapper = sources({ term: 'Wish', game: 'Genshin Impact', available: false })
  expect(wrapper.get('h2').text()).toBe('Add Wish History')
  expect(retrieve(wrapper).attributes('disabled')).toBeDefined()
  expect(wrapper.get<HTMLInputElement>('#cache-file').element.disabled).toBe(true)
  expect(wrapper.text()).toContain('Retrieval for Genshin Impact is coming soon.')
  wrapper.unmount()
})

test('shows a note about the last retrieval, and focuses the control that started it', () => {
  const wrapper = sources({
    term: 'Warp',
    game: 'Honkai: Star Rail',
    available: true,
    note: 'Retrieval cancelled. Nothing was saved.',
  })
  const note = wrapper.get('.note')
  expect(note.text()).toBe('Retrieval cancelled. Nothing was saved.')
  expect(note.attributes('role')).toBe('status')
  const focus = (wrapper.vm as unknown as { focus: (source: string) => void }).focus
  focus('device')
  expect(document.activeElement).toBe(retrieve(wrapper).element)
  focus('file')
  expect(document.activeElement).toBe(wrapper.get('#cache-file').element)
  wrapper.unmount()
})

const modes = (wrapper: ReturnType<typeof sources>) =>
  wrapper
    .findAll<HTMLInputElement>('fieldset input[type="radio"]')
    .map((radio) => [radio.element.labels![0].textContent?.trim(), radio.element.checked])

test('offers new rolls only or the full history, for either way of finding the link', async () => {
  const wrapper = sources({ term: 'Warp', game: 'Honkai: Star Rail', available: true })
  const fieldset = wrapper.get('fieldset')
  // The options speak for themselves; the group is named for screen readers only.
  expect(fieldset.get('legend').text()).toBe('What to retrieve')
  expect(fieldset.get('legend').classes()).toContain('visually-hidden')
  expect(modes(wrapper)).toEqual([
    ['New rolls only', true],
    ['Full history', false],
  ])
  expect(wrapper.get(`#${fieldset.attributes('aria-describedby')}`).text()).toBe(
    'Select “Full history” to fill in earlier gaps of missing data.',
  )
  await wrapper.findAll('fieldset input')[1].setValue(true)
  expect(wrapper.emitted('update:mode')).toEqual([['full']])
  await wrapper.setProps({ mode: 'full' })
  expect(modes(wrapper)).toEqual([
    ['New rolls only', false],
    ['Full history', true],
  ])
  // And back again.
  await wrapper.findAll('fieldset input')[0].setValue(true)
  expect(wrapper.emitted('update:mode')).toEqual([['full'], ['new']])
  wrapper.unmount()
})

test('the choice is disabled without retrieval for the game', () => {
  const wrapper = sources({ term: 'Wish', game: 'Genshin Impact', available: false })
  expect(wrapper.findAll('fieldset input').map((radio) => radio.attributes('disabled'))).toEqual([
    '',
    '',
  ])
  wrapper.unmount()
})
