import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import RarityFilters from './RarityFilters.vue'

test('toggles each rarity, pressed while it is shown', async () => {
  const wrapper = mount(RarityFilters, { props: { shown: ['5', '3'] } })
  const group = wrapper.get('[role="group"]')
  expect(group.attributes('aria-label')).toBe('Show rarities')
  const buttons = wrapper.findAll('button')
  expect(buttons.map((button) => [button.text(), button.attributes('aria-pressed')])).toEqual([
    ['5★', 'true'],
    ['4★', 'false'],
    ['3★', 'true'],
  ])
  // Each rarity is named in text as well as colour.
  expect(buttons.map((button) => button.classes())).toEqual([
    expect.arrayContaining(['rarity-5']),
    expect.arrayContaining(['rarity-4']),
    expect.arrayContaining(['rarity-3']),
  ])
  await buttons[1].trigger('click')
  await buttons[0].trigger('click')
  expect(wrapper.emitted('toggle')).toEqual([['4'], ['5']])
})
