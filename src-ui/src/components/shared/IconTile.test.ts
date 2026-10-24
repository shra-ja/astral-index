import { TriangleAlert } from '@lucide/vue'
import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import IconTile from './IconTile.vue'

test('draws its icon at the tile’s size, hidden from screen readers, in the card’s tone', () => {
  const wrapper = mount(IconTile, { props: { icon: TriangleAlert } })
  const tile = wrapper.get('span')
  expect(tile.attributes('aria-hidden')).toBe('true')
  const icon = tile.get('svg')
  expect(icon.attributes('width')).toBe('22')
  expect(icon.attributes('stroke-width')).toBe('1.75')
  expect(tile.classes()).toContain('neutral')
  for (const tone of ['accent', 'error'] as const) {
    const toned = mount(IconTile, { props: { icon: TriangleAlert, tone } })
    expect(toned.get('span').classes(), tone).toContain(tone)
  }
})
