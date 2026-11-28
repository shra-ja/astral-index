import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import AccountSelector from './AccountSelector.vue'

const asia = { uid: '100000001', server: 'prod_official_asia', timezone: 8, rolls: 2030 }
const europe = { uid: '100000002', server: 'prod_official_eur', timezone: 1, rolls: 88 }
const current = { uid: asia.uid, server: asia.server }
const named = 'Account: UID 100000001, Asia server'

test('the only saved account shows as text, not a control', () => {
  const wrapper = mount(AccountSelector, { props: { accounts: [asia], current } })
  expect(wrapper.get('[role="group"]').attributes('aria-label')).toBe(named)
  expect(wrapper.find('button').exists()).toBe(false)
})

test('the current account shows as text before the saved accounts are read', () => {
  const wrapper = mount(AccountSelector, { props: { accounts: [], current } })
  expect(wrapper.get('[role="group"]').attributes('aria-label')).toBe(named)
  expect(wrapper.find('button').exists()).toBe(false)
})

test('with more saved accounts, a switcher offers each and passes on the one chosen', async () => {
  const wrapper = mount(AccountSelector, {
    props: { accounts: [europe, asia], current },
    attachTo: document.body,
  })
  expect(wrapper.find('[role="group"]').exists()).toBe(false)
  const button = wrapper.get('button[aria-haspopup="menu"]')
  expect(button.attributes('aria-label')).toBe(
    'Switch account. Current: UID 100000001, Asia server',
  )
  await button.trigger('click')
  const items = wrapper.findAll('[role="menuitemradio"]')
  expect(items.map((item) => item.get('.uid').text())).toEqual(['100000002', '100000001'])
  await items[0].trigger('click')
  expect(wrapper.emitted('switch')).toEqual([[europe]])
  wrapper.unmount()
})
