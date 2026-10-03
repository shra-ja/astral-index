import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import RetrievalProgress from './RetrievalProgress.vue'

type Props = {
  term: string
  source: 'device' | 'file'
  stage: 'finding' | 'downloading'
  status: string
  cancelling: boolean
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
  wrapper.findAll('li').map((step) => [step.get('.label').text(), step.attributes('data-state')])

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
