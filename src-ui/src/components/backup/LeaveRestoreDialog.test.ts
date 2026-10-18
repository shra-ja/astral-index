import { mount } from '@vue/test-utils'
import { beforeEach, expect, test } from 'vitest'
import LeaveRestoreDialog from './LeaveRestoreDialog.vue'

// jsdom has no modal dialogs: mark the dialog open, and close it with a close event,
// as browsers do.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
})

const shown = () => mount(LeaveRestoreDialog, { attachTo: document.body })
const button = (wrapper: ReturnType<typeof shown>, name: string) =>
  wrapper.findAll('button').find((candidate) => candidate.text() === name)!

test('asks whether to leave, as a modal named by its heading, with Stay focused', () => {
  const wrapper = shown()
  const dialog = wrapper.get('dialog')
  expect(dialog.attributes('open')).toBeDefined()
  expect(dialog.attributes('aria-labelledby')).toBe('leave-restore-title')
  expect(wrapper.get('h2#leave-restore-title').text()).toBe('Leave Without Restoring?')
  expect(wrapper.get('p').text()).toBe(
    'The backup you chose is set aside, and your history stays as it is. You can choose it again at any time.',
  )
  expect(wrapper.findAll('button').map((each) => each.text())).toEqual(['Stay', 'Leave'])
  expect(document.activeElement).toBe(button(wrapper, 'Stay').element)
  wrapper.unmount()
})

test('Leave asks to leave; Stay and Esc ask to stay', async () => {
  let wrapper = shown()
  await button(wrapper, 'Leave').trigger('click')
  expect(wrapper.emitted('leave')).toHaveLength(1)
  expect(wrapper.emitted('stay')).toBeUndefined()
  wrapper.unmount()
  wrapper = shown()
  await button(wrapper, 'Stay').trigger('click')
  expect(wrapper.emitted('stay')).toHaveLength(1)
  expect(wrapper.emitted('leave')).toBeUndefined()
  wrapper.unmount()
  // Esc closes the dialog natively.
  wrapper = shown()
  wrapper.get('dialog').element.close()
  expect(wrapper.emitted('stay')).toHaveLength(1)
  expect(wrapper.emitted('leave')).toBeUndefined()
  wrapper.unmount()
})
