import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { h } from 'vue'
import AppTooltip from './AppTooltip.vue'

let wrapper: ReturnType<typeof render>
const render = (props: { text: string; placement?: 'top' | 'right' } = { text: 'Coming soon' }) =>
  mount(AppTooltip, {
    props,
    slots: {
      default: ({ tooltipId }: { tooltipId: string }) => [
        h('button', { type: 'button', 'aria-describedby': tooltipId }, 'Choose file…'),
        h('a', { href: '#elsewhere' }, 'Elsewhere'),
      ],
    },
    attachTo: document.body,
  })
beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  wrapper.unmount()
  vi.useRealTimers()
})

const tooltip = () => wrapper.get('[role="tooltip"]')
const shown = () => tooltip().isVisible()
const trigger = () => wrapper.get('button')
// The pointer entering or leaving any of the slot or the tooltip, as the browser reports it.
const enter = () => wrapper.trigger('pointerenter')
const leave = () => wrapper.trigger('pointerleave')
const escape = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

test('describes its element with the text, hidden until wanted', () => {
  wrapper = render()
  expect(trigger().text()).toBe('Choose file…')
  expect(tooltip().text()).toBe('Coming soon')
  expect(trigger().attributes('aria-describedby')).toBe(tooltip().attributes('id'))
  expect(shown()).toBe(false)
})

test('shows after a pause under the pointer, and stays while the pointer moves onto it', async () => {
  wrapper = render()
  await enter()
  await vi.advanceTimersByTimeAsync(399)
  expect(shown()).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  expect(shown()).toBe(true)
  // Leaving starts a short grace period; reaching the tooltip within it keeps it open.
  await leave()
  await vi.advanceTimersByTimeAsync(99)
  await enter()
  await vi.advanceTimersByTimeAsync(500)
  expect(shown()).toBe(true)
  await leave()
  await vi.advanceTimersByTimeAsync(100)
  expect(shown()).toBe(false)
})

test('passing over the element without pausing shows nothing', async () => {
  wrapper = render()
  await enter()
  await vi.advanceTimersByTimeAsync(300)
  await leave()
  await vi.advanceTimersByTimeAsync(1000)
  expect(shown()).toBe(false)
})

test('keyboard focus shows it at once, and it stays until focus leaves', async () => {
  wrapper = render()
  trigger().element.focus()
  await vi.advanceTimersByTimeAsync(0)
  expect(shown()).toBe(true)
  // The pointer passing by does not hide it while the element keeps focus.
  await enter()
  await leave()
  await vi.advanceTimersByTimeAsync(1000)
  expect(shown()).toBe(true)
  // Focus moving within the slot keeps it; leaving the slot hides it.
  wrapper.get('a').element.focus()
  await vi.advanceTimersByTimeAsync(0)
  expect(shown()).toBe(true)
  wrapper.get('a').element.blur()
  await vi.advanceTimersByTimeAsync(0)
  expect(shown()).toBe(false)
})

test('focus from a press, not the keyboard, waits for the pointer as usual', async () => {
  wrapper = render()
  vi.spyOn(trigger().element, 'matches').mockReturnValue(false)
  trigger().element.focus()
  await vi.advanceTimersByTimeAsync(0)
  expect(shown()).toBe(false)
})

test('Escape hides it without moving focus, until the next time it is wanted', async () => {
  wrapper = render()
  trigger().element.focus()
  await vi.advanceTimersByTimeAsync(0)
  escape()
  await vi.advanceTimersByTimeAsync(1000)
  expect(shown()).toBe(false)
  expect(document.activeElement).toBe(trigger().element)
  // Pausing the pointer on it again shows it again.
  await enter()
  await vi.advanceTimersByTimeAsync(400)
  expect(shown()).toBe(true)
  // So does focusing it again from the keyboard.
  escape()
  trigger().element.blur()
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }))
  trigger().element.focus()
  await vi.advanceTimersByTimeAsync(0)
  expect(shown()).toBe(true)
})

test('Escape while hidden is left alone', async () => {
  wrapper = render()
  const listener = vi.spyOn(document, 'removeEventListener')
  escape()
  await vi.advanceTimersByTimeAsync(0)
  expect(shown()).toBe(false)
  expect(listener).not.toHaveBeenCalled()
})

test('floats beside its element in the window, on the side asked for', async () => {
  wrapper = render({ text: 'Import', placement: 'right' })
  trigger().element.focus()
  await vi.advanceTimersByTimeAsync(0)
  expect(tooltip().attributes('style')).toContain('position: fixed')
  expect(tooltip().attributes('data-placement')).toBe('right')
})

test('unmounting while shown or pending leaves nothing running', async () => {
  wrapper = render()
  trigger().element.focus()
  await vi.advanceTimersByTimeAsync(0)
  await enter()
  const removed = vi.spyOn(document, 'removeEventListener')
  wrapper.unmount()
  expect(removed).toHaveBeenCalledWith('keydown', expect.any(Function))
  expect(vi.getTimerCount()).toBe(0)
  wrapper = render()
})
