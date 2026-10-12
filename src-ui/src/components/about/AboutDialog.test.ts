import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { nextTick } from 'vue'
import licence from '../../../../LICENSE?raw'
import AboutDialog from './AboutDialog.vue'

const info = { version: '0.1.0', folder: '/local/astral-index', portable: false }

// jsdom has no modal dialogs: record the call and mark the dialog open, as browsers do.
const showModal = vi.fn(function (this: HTMLDialogElement) {
  this.setAttribute('open', '')
})
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = showModal
})
afterEach(() => {
  showModal.mockClear()
  document.body.innerHTML = ''
})

const open = () => mount(AboutDialog, { props: { info, failed: null }, attachTo: document.body })
type Dialog = ReturnType<typeof open>
const button = (wrapper: Dialog, name: string) =>
  wrapper.findAll('button').find((each) => (each.attributes('aria-label') ?? each.text()) === name)!

test('opens as a modal dialog named About Astral Index, on its main view', () => {
  const wrapper = open()
  const dialog = wrapper.get('dialog')
  expect(showModal).toHaveBeenCalledOnce()
  expect(showModal.mock.instances[0]).toBe(dialog.element)
  expect(dialog.attributes('aria-label')).toBe('About Astral Index')
  expect(wrapper.find('.about-summary').exists()).toBe(true)
})

test('Close, and the dialog closing itself as Esc does, both ask to close', async () => {
  const wrapper = open()
  await button(wrapper, 'Close').trigger('click')
  wrapper.get('dialog').element.dispatchEvent(new Event('close'))
  expect(wrapper.emitted('close')).toHaveLength(2)
})

test('passes the main view’s openings on', async () => {
  const wrapper = open()
  await button(wrapper, 'Show in Folder').trigger('click')
  await button(wrapper, 'Issues Page').trigger('click')
  expect(wrapper.emitted('reveal')).toHaveLength(1)
  expect(wrapper.emitted('issues')).toHaveLength(1)
})

test('the licence view shows the app’s MIT licence, and Back returns to the button', async () => {
  const wrapper = open()
  await button(wrapper, 'Licence Text').trigger('click')
  expect(wrapper.find('.about-summary').exists()).toBe(false)
  expect(wrapper.get('h2').text()).toBe('Licence')
  expect(wrapper.get('.licence').text()).toBe(licence.trim())
  expect(licence).toContain('MIT License')
  expect(document.activeElement).toBe(button(wrapper, 'Back').element)
  await button(wrapper, 'Back').trigger('click')
  await nextTick()
  expect(wrapper.find('.about-summary').exists()).toBe(true)
  expect(document.activeElement).toBe(button(wrapper, 'Licence Text').element)
})

test('the notices view says the list is still to come, and closes like the main view', async () => {
  const wrapper = open()
  await button(wrapper, 'Third-Party Notices').trigger('click')
  expect(wrapper.get('h2').text()).toBe('Third-Party Notices')
  expect(wrapper.get('.notices').text()).toBe(
    'The list of third-party components and their licences is not in this build yet.',
  )
  await button(wrapper, 'Back').trigger('click')
  await nextTick()
  expect(document.activeElement).toBe(button(wrapper, 'Third-Party Notices').element)
  await button(wrapper, 'Third-Party Notices').trigger('click')
  await button(wrapper, 'Close').trigger('click')
  expect(wrapper.emitted('close')).toHaveLength(1)
})
