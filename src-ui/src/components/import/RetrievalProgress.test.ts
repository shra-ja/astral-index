import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import type { Download } from '../../composables/useRetrieval'
import RetrievalProgress from './RetrievalProgress.vue'

type Props = {
  term: string
  source: 'device' | 'file'
  stage: 'finding' | 'downloading'
  status: string
  cancelling: boolean
  download?: Download
}
const progress = (props: Partial<Props> = {}) =>
  mount(RetrievalProgress, {
    props: {
      term: 'Warp',
      source: 'device',
      stage: 'finding',
      status: 'Searching…',
      cancelling: false,
      ...props,
    },
    attachTo: document.body,
  })
const steps = (wrapper: ReturnType<typeof progress>) =>
  wrapper
    .findAll('.steps > li')
    .map((step) => [step.get('.label').text(), step.attributes('data-state')])

test('names each step and marks where retrieval is', async () => {
  const wrapper = progress()
  expect(wrapper.get('h2').text()).toBe('Retrieving Warp History')
  expect(wrapper.text()).toContain('Nothing is saved until you review and confirm.')
  expect(steps(wrapper)).toEqual([
    ['Find the warp history link in the game files', 'active'],
    ['Check the link with HoYoverse', 'active'],
    ['Download your rolls', 'waiting'],
    ['Prepare the review', 'waiting'],
  ])
  await wrapper.setProps({ stage: 'downloading', source: 'file' })
  expect(steps(wrapper)).toEqual([
    ['Found the warp history link in the provided file', 'done'],
    ['Checked the link with HoYoverse', 'done'],
    ['Downloading your rolls', 'active'],
    ['Prepare the review', 'waiting'],
  ])
  wrapper.unmount()
})

test('announces the status, and Cancel emits until cancelling', async () => {
  const wrapper = progress({ status: 'Retrieving Stellar Warp, page 1 · 1 roll so far' })
  const status = wrapper.get('[role="status"]')
  expect(status.text()).toBe('Retrieving Stellar Warp, page 1 · 1 roll so far')
  expect(status.attributes()).toEqual(
    expect.objectContaining({ 'aria-live': 'polite', 'aria-atomic': 'true' }),
  )
  expect(wrapper.text()).toContain('Cancelling keeps your saved history unchanged.')
  await wrapper.get('.cancel').trigger('click')
  expect(wrapper.emitted('cancel')).toHaveLength(1)
  await wrapper.setProps({ cancelling: true })
  expect(wrapper.get('.cancel').attributes('disabled')).toBeDefined()
  wrapper.unmount()
})

test('Cancel takes focus as the progress appears', () => {
  const wrapper = progress()
  expect(document.activeElement).toBe(wrapper.get('.cancel').element)
  wrapper.unmount()
})

// Stellar and Departure Warp are done; Character Event Warp is on its seventh page.
const downloading: Download = {
  category: '11',
  page: 7,
  pages: { '1': 3, '2': 1, '11': 7 },
  records: 1106,
  retrying: false,
}
const categoryRows = (wrapper: ReturnType<typeof progress>) =>
  wrapper
    .findAll('.categories li')
    .map((row) => [...row.findAll('span').map((cell) => cell.text()), row.attributes('data-state')])
const statusShown = (wrapper: ReturnType<typeof progress>) =>
  !wrapper.get('[role="status"]').classes().includes('visually-hidden')

test('while downloading, shows the category reached, the rolls so far and each category', () => {
  const wrapper = progress({
    stage: 'downloading',
    status: 'Retrieving Character Event Warp, page 7 · 1,106 rolls so far',
    download: downloading,
  })
  expect(wrapper.get('.summary').text()).toMatch(/^Category 3 of 6\s+1,106 rolls so far$/)
  const bar = wrapper.get('[role="progressbar"]')
  expect(bar.attributes()).toEqual(
    expect.objectContaining({
      'aria-label': 'Categories downloaded',
      'aria-valuemin': '0',
      'aria-valuemax': '6',
      'aria-valuenow': '2',
      'aria-valuetext': 'Category 3 of 6',
    }),
  )
  // Categories are listed in the order they are retrieved.
  expect(categoryRows(wrapper)).toEqual([
    ['Stellar Warp', '3 pages', 'Done', 'done'],
    ['Departure Warp', '1 page', 'Done', 'done'],
    ['Character Event Warp', 'page 7', 'Downloading…', 'active'],
    ['Light Cone Event Warp', '—', 'Waiting', 'waiting'],
    ['Character Collaboration Warp', '—', 'Waiting', 'waiting'],
    ['Light Cone Collaboration Warp', '—', 'Waiting', 'waiting'],
  ])
  expect(
    wrapper.get('.categories').element.closest('li')?.querySelector('.label')?.textContent,
  ).toBe('Downloading your rolls')
  // The row says it all; the status is still announced.
  expect(statusShown(wrapper)).toBe(false)
  wrapper.unmount()
})

test('the status shows until the first page, during retry waits and while cancelling', async () => {
  const wrapper = progress({ stage: 'downloading', status: 'Retrieving your warp history…' })
  expect(wrapper.find('.summary').exists()).toBe(false)
  expect(wrapper.find('.categories').exists()).toBe(false)
  expect(statusShown(wrapper)).toBe(true)
  await wrapper.setProps({ download: { ...downloading, retrying: true } })
  expect(statusShown(wrapper)).toBe(true)
  await wrapper.setProps({ download: downloading, cancelling: true })
  expect(statusShown(wrapper)).toBe(true)
  await wrapper.setProps({ cancelling: false })
  expect(statusShown(wrapper)).toBe(false)
  // While finding the link there is no download yet.
  await wrapper.setProps({ stage: 'finding', download: undefined })
  expect(statusShown(wrapper)).toBe(true)
  wrapper.unmount()
})

test('a category passed without any page shows no count rather than failing', () => {
  const wrapper = progress({
    stage: 'downloading',
    download: { category: '2', page: 1, pages: { '2': 1 }, records: 0, retrying: false },
  })
  expect(categoryRows(wrapper).slice(0, 2)).toEqual([
    ['Stellar Warp', '—', 'Done', 'done'],
    ['Departure Warp', 'page 1', 'Downloading…', 'active'],
  ])
  wrapper.unmount()
})
