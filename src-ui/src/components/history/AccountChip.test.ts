import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import AccountChip from './AccountChip.vue'

test('names the account by UID and server, as text rather than a control', () => {
  const named = mount(AccountChip, { props: { uid: '100000001', server: 'prod_official_eur' } })
  expect(named.get('.account').attributes('aria-label')).toBe(
    'Account: UID 100000001, Europe server',
  )
  expect(named.get('.server').text()).toBe('Europe')
  // An unknown server shows as given.
  const wrapper = mount(AccountChip, { props: { uid: '100000001', server: 'synthetic-server' } })
  expect(wrapper.get('.account').attributes('aria-label')).toBe(
    'Account: UID 100000001, synthetic-server server',
  )
  expect(wrapper.findAll('.account > span').map((part) => part.text())).toEqual([
    'UID',
    '100000001',
    'synthetic-server',
  ])
  expect(wrapper.find('button').exists()).toBe(false)
})
