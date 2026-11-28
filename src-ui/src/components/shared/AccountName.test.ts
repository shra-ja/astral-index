import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import AccountName from './AccountName.vue'

const parts = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findAll('.name > span').map((part) => [part.classes()[0], part.text()])

test('shows the UID and the server by name, hidden from assistive technology', () => {
  // The control holding it names the account in its own label.
  const wrapper = mount(AccountName, { props: { uid: '100000001', server: 'prod_official_eur' } })
  expect(parts(wrapper)).toEqual([
    ['label', 'UID'],
    ['uid', '100000001'],
    ['server', 'Europe'],
  ])
  expect(
    wrapper.findAll('.name > span').every((part) => part.attributes('aria-hidden') === 'true'),
  ).toBe(true)
  // An unknown server shows as given.
  const unknown = mount(AccountName, { props: { uid: '100000001', server: 'synthetic-server' } })
  expect(unknown.get('.server').text()).toBe('synthetic-server')
})
