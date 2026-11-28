import { mount } from '@vue/test-utils'
import { afterEach, expect, test, vi } from 'vitest'
import AccountSwitcher from './AccountSwitcher.vue'

const accounts = [
  { uid: '100000003', server: 'prod_official_eur', timezone: 1, rolls: 1 },
  { uid: '100000001', server: 'prod_official_asia', timezone: 8, rolls: 2030 },
  { uid: '100000002', server: 'synthetic-server', timezone: null, rolls: 88 },
]
const current = { uid: '100000001', server: 'prod_official_asia' }
let wrapper: ReturnType<typeof render>
const render = () =>
  mount(AccountSwitcher, { props: { accounts, current }, attachTo: document.body })
afterEach(() => wrapper.unmount())

const button = () => wrapper.get('button[aria-haspopup="menu"]')
const items = () => wrapper.findAll('[role="menuitemradio"]')
const focused = () => document.activeElement

test('the button names the current account and opens a menu of every saved account', async () => {
  wrapper = render()
  expect(button().attributes('aria-label')).toBe(
    'Switch account. Current: UID 100000001, Asia server',
  )
  expect(button().attributes('aria-expanded')).toBe('false')
  expect(wrapper.find('[role="menu"]').exists()).toBe(false)
  await button().trigger('click')
  expect(button().attributes('aria-expanded')).toBe('true')
  const menu = wrapper.get('[role="menu"]')
  expect(button().attributes('aria-controls')).toBe(menu.attributes('id'))
  expect(menu.attributes('aria-label')).toBe('Saved accounts')
  expect(
    items().map((item) => ['.uid', '.server', '.rolls'].map((part) => item.get(part).text())),
  ).toEqual([
    ['100000003', 'Europe', '1 roll'],
    ['100000001', 'Asia', '2,030 rolls'],
    ['100000002', 'synthetic-server', '88 rolls'],
  ])
  expect(items().map((item) => item.attributes('aria-checked'))).toEqual(['false', 'true', 'false'])
  // Opening moves focus to the current account.
  expect(focused()).toBe(items()[1].element)
  await button().trigger('click')
  expect(wrapper.find('[role="menu"]').exists()).toBe(false)
})

test('arrow keys move through the accounts, wrapping, and Home and End jump', async () => {
  wrapper = render()
  await button().trigger('keydown', { key: 'ArrowDown' })
  expect(focused()).toBe(items()[1].element)
  const press = (key: string) => wrapper.get('[role="menu"]').trigger('keydown', { key })
  await press('ArrowDown')
  expect(focused()).toBe(items()[2].element)
  await press('ArrowDown')
  expect(focused()).toBe(items()[0].element)
  await press('ArrowUp')
  expect(focused()).toBe(items()[2].element)
  await press('Home')
  expect(focused()).toBe(items()[0].element)
  await press('End')
  expect(focused()).toBe(items()[2].element)
  // Other keys are left alone.
  await press('a')
  expect(focused()).toBe(items()[2].element)
  await button().trigger('keydown', { key: 'Enter' })
  expect(wrapper.find('[role="menu"]').exists()).toBe(true)
})

test('ArrowUp on the button also opens the menu at the current account', async () => {
  wrapper = render()
  await button().trigger('keydown', { key: 'ArrowUp' })
  expect(focused()).toBe(items()[1].element)
})

test('choosing another account switches to it, closes the menu and returns focus', async () => {
  wrapper = render()
  await button().trigger('click')
  await items()[0].trigger('click')
  expect(wrapper.emitted('switch')).toEqual([[accounts[0]]])
  expect(wrapper.find('[role="menu"]').exists()).toBe(false)
  expect(focused()).toBe(button().element)
  // Choosing the current account only closes the menu.
  await button().trigger('click')
  await items()[1].trigger('click')
  expect(wrapper.emitted('switch')).toHaveLength(1)
  expect(wrapper.find('[role="menu"]').exists()).toBe(false)
})

test('Escape closes the menu and returns focus to the button', async () => {
  wrapper = render()
  await button().trigger('click')
  await wrapper.get('[role="menu"]').trigger('keydown', { key: 'Escape' })
  expect(wrapper.find('[role="menu"]').exists()).toBe(false)
  expect(focused()).toBe(button().element)
})

test('Tab closes the menu and lets focus move on', async () => {
  wrapper = render()
  await button().trigger('click')
  await wrapper.get('[role="menu"]').trigger('keydown', { key: 'Tab' })
  expect(wrapper.find('[role="menu"]').exists()).toBe(false)
})

test('a press outside the switcher closes the menu; one inside does not', async () => {
  wrapper = render()
  await button().trigger('click')
  items()[2].element.dispatchEvent(new Event('pointerdown', { bubbles: true }))
  await wrapper.vm.$nextTick()
  expect(wrapper.find('[role="menu"]').exists()).toBe(true)
  document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
  await wrapper.vm.$nextTick()
  expect(wrapper.find('[role="menu"]').exists()).toBe(false)
  // Focus is not pulled back to the button.
  expect(focused()).not.toBe(button().element)
  // Once closed, presses outside no longer matter.
  document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
  await wrapper.vm.$nextTick()
  expect(wrapper.find('[role="menu"]').exists()).toBe(false)
})

test('unmounting while open stops listening for presses outside', async () => {
  wrapper = render()
  await button().trigger('click')
  const removed = vi.spyOn(document, 'removeEventListener')
  wrapper.unmount()
  expect(removed).toHaveBeenCalledWith('pointerdown', expect.any(Function), true)
  removed.mockRestore()
  wrapper = render()
})
