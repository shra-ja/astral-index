import { expect, test } from 'vitest'
import { categoryTabs, initials, serverDate, serverDateTime, utcOffset } from './format'

test('server times read as written, in the server’s own time', () => {
  expect(serverDate('2026-04-02 10:00:00')).toBe('2 Apr 2026')
  expect(serverDateTime('2026-09-28 21:14:03')).toBe('28 Sep 2026, 21:14:03')
})

test('offsets name UTC, or the server when unknown', () => {
  expect(utcOffset(8)).toBe('UTC+8')
  expect(utcOffset(-5)).toBe('UTC−5')
  expect(utcOffset(0)).toBe('UTC')
  expect(utcOffset(null)).toBe('server time')
})

test('history tabs list the event warps first, with short names', () => {
  expect(categoryTabs.map(({ gacha_type, label }) => [gacha_type, label])).toEqual([
    ['11', 'Character Event'],
    ['12', 'Light Cone Event'],
    ['1', 'Stellar'],
    ['2', 'Departure'],
    ['21', 'Collab Character'],
    ['22', 'Collab Light Cone'],
  ])
})

test('item placeholders show up to two initials', () => {
  expect(initials('Acheron')).toBe('A')
  expect(initials('Fine Fruit')).toBe('FF')
  expect(initials('Dan Heng • Imbibitor Lunae')).toBe('DH')
  expect(initials('march 7th')).toBe('M7')
})
