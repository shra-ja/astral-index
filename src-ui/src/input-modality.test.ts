import { expect, test } from 'vitest'
import { keyboardInput } from './input-modality'

const press = (type: 'keydown' | 'pointerdown') =>
  document.body.dispatchEvent(new Event(type, { bubbles: true }))

test('reports whether the latest press came from the keyboard or a pointer', () => {
  press('keydown')
  expect(keyboardInput()).toBe(true)
  press('pointerdown')
  expect(keyboardInput()).toBe(false)
  press('keydown')
  expect(keyboardInput()).toBe(true)
})
