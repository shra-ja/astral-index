import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import { nextTick } from 'vue'
import type { NoticeComponent, Notices } from '../../notices'
import NoticesList from './NoticesList.vue'

const component = (
  name: string,
  kind: NoticeComponent['kind'],
  licences: NoticeComponent['licences'],
): NoticeComponent => ({
  name,
  version: '1.0.0',
  kind,
  source: `https://example.test/${name}`,
  licences,
})
const notices: Notices = {
  texts: ['MIT License for serde', 'Apache License', 'ISC License', 'SIL Open Font License'],
  components: [
    component('ring', 'crate', [
      { id: 'Apache-2.0', text: 1 },
      { id: 'ISC', text: 2 },
    ]),
    component('serde', 'crate', [{ id: 'MIT', text: 0 }]),
    component('vue', 'npm', [{ id: 'MIT', text: 0 }]),
    component('hanken-grotesk', 'font', [{ id: 'OFL-1.1', text: 3 }]),
  ],
}
const list = (props: { notices: Notices | null; missing: boolean }) => mount(NoticesList, { props })
const text = (wrapper: ReturnType<typeof list>) => wrapper.text().replace(/\s+/g, ' ')

test('lists every component by origin, with a count per group', () => {
  const wrapper = list({ notices, missing: false })
  expect(wrapper.findAll('h3').map((heading) => heading.text())).toEqual([
    'Rust Crates (2)',
    'Frontend Packages (1)',
    'Typeface (1)',
  ])
  expect(wrapper.findAll('summary').map((summary) => summary.text().replace(/\s+/g, ' '))).toEqual([
    'ring 1.0.0 Apache-2.0 AND ISC',
    'serde 1.0.0 MIT',
    'vue 1.0.0 MIT',
    'hanken-grotesk 1.0.0 OFL-1.1',
  ])
  // A group with nothing in it is left out.
  const crates = { ...notices, components: notices.components.slice(0, 2) }
  expect(list({ notices: crates, missing: false }).findAll('h3')).toHaveLength(1)
})

test('a licence text is rendered only once its component is opened', async () => {
  const wrapper = list({ notices, missing: false })
  expect(wrapper.findAll('.licence-text')).toHaveLength(0)
  const ring = wrapper.findAll('details')[0]
  ;(ring.element as HTMLDetailsElement).open = true
  await ring.trigger('toggle')
  expect(ring.findAll('.licence-text').map((each) => each.text())).toEqual([
    'Apache License',
    'ISC License',
  ])
  expect(ring.get('.source').text()).toBe('Source: https://example.test/ring')
  expect(wrapper.findAll('.licence-text')).toHaveLength(2)
  // Closing it removes the texts again.
  ;(ring.element as HTMLDetailsElement).open = false
  await ring.trigger('toggle')
  await nextTick()
  expect(wrapper.findAll('.licence-text')).toHaveLength(0)
})

test('says when the notices are loading, or missing from a development run', () => {
  expect(text(list({ notices: null, missing: false }))).toBe('Loading the notices…')
  expect(list({ notices: null, missing: false }).find('[role=status]').exists()).toBe(true)
  expect(text(list({ notices: null, missing: true }))).toBe(
    'Each build generates the notices; this one has none. Run npm run notices to see them here.',
  )
})
