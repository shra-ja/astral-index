import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import ScreenHeader from './ScreenHeader.vue'

test('shows the screen’s title and game, then any controls the screen adds', () => {
  const wrapper = mount(ScreenHeader, {
    props: { title: 'Warp History', game: 'Honkai: Star Rail' },
    slots: { default: '<button type="button">Account</button>' },
  })
  expect(wrapper.get('header h1').text()).toBe('Warp History')
  expect(wrapper.get('.game').text()).toBe('Honkai: Star Rail')
  expect(wrapper.get('button').text()).toBe('Account')
})

test('a screen that belongs to no game shows its title alone', () => {
  const wrapper = mount(ScreenHeader, { props: { title: 'Backup & Restore' } })
  expect(wrapper.get('header h1').text()).toBe('Backup & Restore')
  expect(wrapper.find('.game').exists()).toBe(false)
})
