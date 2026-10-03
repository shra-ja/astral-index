import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import ImportSaved from './ImportSaved.vue'

const saved = (inserted: number, duplicates: number) => ({
  summary: { inserted, duplicates, conflicts: 0 },
  fiveStar: 2,
  fourStar: 27,
  uid: '100000001',
  server: 'synthetic-server',
})

test('says how many rolls were saved and where, with the caller’s link and Done', async () => {
  const wrapper = mount(ImportSaved, {
    props: { saved: saved(214, 1816) },
    slots: { default: '<a href="#/history">View warp history</a>' },
    attachTo: document.body,
  })
  expect(wrapper.get('h2').text()).toBe('214 Rolls Saved')
  expect(document.activeElement).toBe(wrapper.get('h2').element)
  expect(wrapper.get('p').text()).toBe('Added to UID 100000001 (synthetic-server).')
  await wrapper.setProps({ saved: { ...saved(214, 1816), server: 'prod_official_cht' } })
  expect(wrapper.get('p').text()).toBe('Added to UID 100000001 (TW, HK, MO).')
  expect(
    wrapper
      .findAll('.stat')
      .map((stat) => [stat.get('.stat-value').text(), stat.get('.stat-label').text()]),
  ).toEqual([
    ['2', 'New 5★'],
    ['27', 'New 4★'],
    ['1,816', 'Existing rolls skipped'],
  ])
  expect(wrapper.get('a').text()).toBe('View warp history')
  await wrapper.get('button').trigger('click')
  expect(wrapper.emitted('done')).toHaveLength(1)
  wrapper.unmount()
})
