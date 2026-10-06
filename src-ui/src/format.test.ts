import { expect, test } from 'vitest'
import {
  categoryTabs,
  initials,
  localDateTime,
  rate,
  serverDate,
  serverDateTime,
  serverName,
  storedPeriod,
  utcOffset,
} from './format'

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
    ['21', 'Character Collab'],
    ['22', 'Light Cone Collab'],
  ])
})

test('item placeholders show up to two initials', () => {
  expect(initials('Acheron')).toBe('A')
  expect(initials('Fine Fruit')).toBe('FF')
  expect(initials('Dan Heng • Imbibitor Lunae')).toBe('DH')
  expect(initials('march 7th')).toBe('M7')
})

test('servers read as the game names them, and unknown ones as given', () => {
  expect(
    [
      'prod_official_usa',
      'prod_official_eur',
      'prod_official_asia',
      'prod_official_cht',
      'prod_gf_cn',
      'prod_qd_cn',
      'prod_official_new',
    ].map(serverName),
  ).toEqual([
    'America',
    'Europe',
    'Asia',
    'TW, HK, MO',
    'China',
    'China (Bilibili)',
    'prod_official_new',
  ])
})

test('device times read in local time, here given as UTC', () => {
  expect(localDateTime(1790000000, 'UTC')).toBe('21 Sep 2026, 14:13')
  expect(localDateTime(1790000000, 'Asia/Tokyo')).toBe('21 Sep 2026, 23:13')
  expect(localDateTime(0, 'UTC')).toBe('1 Jan 1970, 00:00')
})

test('rates are shares of the category to two decimals, never rounded down to zero', () => {
  expect(rate(19, 1284)).toBe('1.48%')
  expect(rate(162, 1284)).toBe('12.62%')
  expect(rate(1, 1)).toBe('100.00%')
  expect(rate(0, 50)).toBe('0.00%')
  // A share too small to show is still more than none.
  expect(rate(1, 20001)).toBe('<0.01%')
  expect(rate(1, 20000)).toBe('0.01%')
  // Without rolls there is no rate.
  expect(rate(0, 0)).toBeUndefined()
})

test('a stored period runs from the oldest to the newest roll date, breaking only at its dash', () => {
  expect(storedPeriod('2023-04-26 10:00:00', '2026-09-28 21:14:03')).toEqual([
    '26 Apr 2023 –',
    '28 Sep 2026',
  ])
  expect(storedPeriod('2026-09-28 01:00:00', '2026-09-28 21:14:03')).toEqual([
    '28 Sep 2026 –',
    '28 Sep 2026',
  ])
  expect(storedPeriod(null, null)).toEqual(['None yet'])
})
