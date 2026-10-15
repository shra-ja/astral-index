import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { nextTick } from 'vue'
import licence from '../../../../LICENSE?raw'
import AboutDialog from './AboutDialog.vue'

const info = { version: '0.1.0', folder: '/local/astral-index', portable: false }

// jsdom has no modal dialogs: record the call and mark the dialog open, as browsers do,
// and close it as they do, with a close event.
const showModal = vi.fn(function (this: HTMLDialogElement) {
  this.setAttribute('open', '')
})
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = showModal
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
})
afterEach(() => {
  showModal.mockClear()
  document.body.innerHTML = ''
})

const notices = {
  texts: ['MIT License…'],
  components: [
    {
      name: 'serde',
      version: '1.0.0',
      kind: 'crate' as const,
      source: 'https://crates.io/crates/serde/1.0.0',
      licences: [{ id: 'MIT', text: 0 }],
    },
  ],
}
const open = () =>
  mount(AboutDialog, {
    props: { info, failed: null, notices, noticesMissing: false },
    attachTo: document.body,
  })
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
  // Each paragraph of LICENSE reads as one, wrapping to the dialog, with its words
  // unchanged; the file keeps its own line breaks.
  const paragraphs = wrapper.findAll('.licence p').map((paragraph) => paragraph.element.textContent)
  expect(paragraphs[0]).toBe('MIT License')
  expect(paragraphs).toHaveLength(licence.trim().split(/\n\s*\n/).length)
  expect(paragraphs.some((paragraph) => paragraph.includes('\n'))).toBe(false)
  expect(paragraphs.join(' ')).toBe(licence.trim().split(/\s+/).join(' '))
  expect(licence).toMatch(/copy\nof this software/)
  expect(document.activeElement).toBe(button(wrapper, 'Back').element)
  await button(wrapper, 'Back').trigger('click')
  await nextTick()
  expect(wrapper.find('.about-summary').exists()).toBe(true)
  expect(document.activeElement).toBe(button(wrapper, 'Licence Text').element)
})

test('the notices view asks for the notices and lists them, and closes like the main view', async () => {
  const wrapper = open()
  await button(wrapper, 'Third-Party Notices').trigger('click')
  expect(wrapper.emitted('notices')).toHaveLength(1)
  expect(wrapper.get('h2').text()).toBe('Third-Party Notices')
  expect(wrapper.get('.notices-list h3').text()).toBe('Rust Crates (1)')
  await button(wrapper, 'Back').trigger('click')
  await nextTick()
  expect(document.activeElement).toBe(button(wrapper, 'Third-Party Notices').element)
  await button(wrapper, 'Third-Party Notices').trigger('click')
  await button(wrapper, 'Close').trigger('click')
  expect(wrapper.emitted('close')).toHaveLength(1)
})

/** Press and release the pointer at a point, as on the backdrop or the dialog itself. */
function press(target: Element, [downX, downY]: number[], [upX, upY] = [downX, downY]) {
  target.dispatchEvent(
    new MouseEvent('pointerdown', { bubbles: true, clientX: downX, clientY: downY }),
  )
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: upX, clientY: upY }))
}

test('a press on the backdrop outside the dialog closes it, as Esc does', async () => {
  const wrapper = open()
  const dialog = wrapper.get('dialog').element
  // jsdom lays nothing out: place the dialog's box as a browser would.
  dialog.getBoundingClientRect = () => new DOMRect(100, 50, 600, 400)
  // The backdrop's presses reach the dialog element, outside its box.
  press(dialog, [20, 20])
  expect(wrapper.emitted('close')).toHaveLength(1)
  // A drag that starts inside the dialog, such as selecting text, ends no press there.
  press(dialog, [300, 200], [20, 20])
  // Presses inside it, on its content or on its own edge, keep it open, on every view.
  press(wrapper.get('.about-summary').element, [300, 200])
  press(dialog, [101, 51])
  await button(wrapper, 'Licence Text').trigger('click')
  press(wrapper.get('.licence').element, [300, 200])
  expect(wrapper.emitted('close')).toHaveLength(1)
  press(dialog, [750, 500])
  expect(wrapper.emitted('close')).toHaveLength(2)
})
