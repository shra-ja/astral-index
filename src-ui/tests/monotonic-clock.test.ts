import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import AccountSwitcher from '../src/components/history/AccountSwitcher.vue'
import { monotonic } from './monotonic-clock'

const accounts = [{ uid: '100000001', server: 'prod_official_asia', timezone: 8, rolls: 2 }]

// The wall clock can step back, as under WSL every 30 seconds while the host
// corrects it. `trigger` stamps each event with `Date.now() + 1`, and Vue drops an
// event stamped no later than its handler was attached, so a step back between
// mounting and a click used to lose the click.
test('a click still lands when the wall clock steps back after mounting', async () => {
  const wall = Date.now
  let back = 0
  Date.now = monotonic(() => wall() - back)
  try {
    const wrapper = mount(AccountSwitcher, {
      props: { accounts, current: accounts[0] },
      attachTo: document.body,
    })
    back = 50
    await wrapper.get('button').trigger('click')
    expect(wrapper.get('button').attributes('aria-expanded')).toBe('true')
    wrapper.unmount()
  } finally {
    Date.now = wall
  }
})

test('the clock never runs backwards, and frontend tests run on it', () => {
  let reading = 100
  const clock = monotonic(() => reading)
  expect(clock()).toBe(100)
  reading = 40
  expect(clock()).toBe(100)
  reading = 160
  expect(clock()).toBe(160)
  // The setup file installs it in place of the native clock.
  expect(Function.prototype.toString.call(Date.now)).not.toContain('[native code]')
})
