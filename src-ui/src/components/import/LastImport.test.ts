import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import { localDateTime } from '../../format'
import LastImport from './LastImport.vue'

test('names the last import’s time, source, account and rolls saved', () => {
  const wrapper = mount(LastImport, {
    props: {
      last: {
        imported_at: 1790000000,
        source: 'hoyoverse',
        uid: '100000001',
        server: 'prod_official_asia',
        inserted: 96,
      },
    },
  })
  const line = wrapper.get('section')
  expect(line.attributes('aria-labelledby')).toBe(wrapper.get('.label').attributes('id'))
  expect(wrapper.get('.label').text()).toBe('Last import')
  // The time is the device's own, so it reads in the local time zone.
  expect(wrapper.findAll('.part').map((part) => part.text())).toEqual([
    localDateTime(1790000000),
    'Retrieved from HoYoverse',
    'UID 100000001 (Asia)',
    '96 new rolls saved',
  ])
  // The separators are decoration.
  expect(wrapper.findAll('.separator').map((each) => each.attributes('aria-hidden'))).toEqual([
    'true',
    'true',
    'true',
  ])
})
