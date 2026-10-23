import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import IconTile from './IconTile.vue'

test('holds its icon, hidden from screen readers, in the tone its card gives', () => {
  const wrapper = mount(IconTile, { slots: { default: '<svg class="glyph" />' } })
  const tile = wrapper.get('span')
  expect(tile.attributes('aria-hidden')).toBe('true')
  expect(tile.find('.glyph').exists()).toBe(true)
  expect(tile.classes()).toContain('neutral')
  for (const tone of ['accent', 'error'] as const) {
    const toned = mount(IconTile, { props: { tone } })
    expect(toned.get('span').classes(), tone).toContain(tone)
  }
})
