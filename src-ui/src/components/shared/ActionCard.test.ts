import { FileText } from '@lucide/vue'
import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import ActionCard from './ActionCard.vue'
import IconTile from './IconTile.vue'

const card = () =>
  mount(ActionCard, {
    props: {
      id: 'card-title',
      title: 'Backup',
      text: 'Save a copy.',
      points: ['One', 'Two'],
      icon: FileText,
    },
    slots: {
      default: '<fieldset class="extra" />',
      actions: '<button type="button">Save</button>',
    },
  })

test('names its section by its heading and shows the text, points and slots in order', () => {
  const wrapper = card()
  const section = wrapper.get('section')
  expect(section.attributes('aria-labelledby')).toBe('card-title')
  expect(wrapper.get('h3#card-title').text()).toBe('Backup')
  expect(wrapper.get('h3 + p').text()).toBe('Save a copy.')
  expect(wrapper.findAll('li').map((item) => item.text())).toEqual(['One', 'Two'])
  expect(wrapper.find('ul + .extra').exists()).toBe(true)
  expect(wrapper.get('.actions button').text()).toBe('Save')
})

test('shows its icon in a tile, neutral or accented', async () => {
  const wrapper = card()
  const tile = wrapper.getComponent(IconTile)
  expect(tile.props('icon')).toBe(FileText)
  expect(tile.props('tone')).toBe('neutral')
  await wrapper.setProps({ accent: true })
  expect(wrapper.getComponent(IconTile).props('tone')).toBe('accent')
})

test('announces what its actions report in a status region below them', () => {
  const wrapper = mount(ActionCard, {
    props: { id: 'card-title', icon: FileText, title: 'Backup', text: 'Save a copy.', points: [] },
    slots: {
      actions: '<button type="button">Save</button>',
      status: '<p class="note">Saved</p>',
    },
  })
  const status = wrapper.get('.actions [role="status"]')
  expect(status.get('.note').text()).toBe('Saved')
  expect(wrapper.find('.actions button + [role="status"]').exists()).toBe(true)
})

test('without a status slot there is no status region', () => {
  expect(card().find('[role="status"]').exists()).toBe(false)
})
