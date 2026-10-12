import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import emblem from '../../assets/brand/astral-index-emblem.svg?raw'
import OpenLockup from './OpenLockup.vue'

// The drawing that matters: the group's fill and placement, and each path.
const drawing = (svg: Element) => ({
  group: [
    svg.querySelector('g')?.getAttribute('fill'),
    svg.querySelector('g')?.getAttribute('transform'),
  ],
  paths: [...svg.querySelectorAll('path')].map((path) => [
    path.getAttribute('d'),
    path.getAttribute('transform'),
  ]),
})

test('draws the supplied regular emblem exactly, cropped to its artwork', () => {
  const supplied = new DOMParser().parseFromString(emblem, 'image/svg+xml').documentElement
  const drawn = mount(OpenLockup).get('svg').element
  expect(drawing(supplied).paths).toHaveLength(7)
  expect(drawing(drawn)).toEqual(drawing(supplied))
  expect(drawing(drawn).group[0]).toBe('currentColor')
  // The brand's crop for the open lockup.
  expect(drawn.getAttribute('viewBox')).toBe('41.82 70.88 187.28 124.47')
})

test('beside the regular wordmark, the whole lockup is one image named Astral Index', () => {
  const wrapper = mount(OpenLockup)
  expect(wrapper.attributes('role')).toBe('img')
  expect(wrapper.attributes('aria-label')).toBe('Astral Index')
  expect(wrapper.get('img').attributes('src')).toContain('astral-index-wordmark.svg')
  expect(wrapper.get('img').attributes('alt')).toBe('')
  expect(wrapper.get('svg').attributes('aria-hidden')).toBe('true')
  expect(wrapper.find('title').exists()).toBe(false)
})
