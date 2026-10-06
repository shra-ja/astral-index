<script setup lang="ts">
// Presentational: the account switcher, a menu button listing every saved account
// with its rolls. It emits the chosen account; the screen reads its history. Arrow
// keys, Home and End move through the menu; Escape, Tab or a press outside close it.
import { Check, ChevronDown } from '@lucide/vue'
import { nextTick, onBeforeUnmount, ref, useId, useTemplateRef, watch } from 'vue'
import type { SavedAccount } from '../../commands'
import { plural, serverName } from '../../format'

const props = defineProps<{
  accounts: SavedAccount[]
  current: { uid: string; server: string }
}>()
const emit = defineEmits<{ switch: [account: SavedAccount] }>()

const open = ref(false)
const menuId = useId()
const root = useTemplateRef('root')
const toggle = useTemplateRef('toggle')
const items = useTemplateRef<HTMLButtonElement[]>('items')

const isCurrent = (account: SavedAccount) =>
  account.uid === props.current.uid && account.server === props.current.server

// Only read while the menu is open, when its items are rendered.
const menuItems = () => items.value as HTMLButtonElement[]

function focusItem(index: number) {
  const all = menuItems()
  all[(index + all.length) % all.length]?.focus()
}

/** Open the menu with focus on the current account. */
async function show() {
  open.value = true
  await nextTick()
  focusItem(Math.max(0, props.accounts.findIndex(isCurrent)))
}

function close(refocus: boolean) {
  open.value = false
  if (refocus) toggle.value?.focus()
}

function onButtonKey(event: KeyboardEvent) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
  event.preventDefault()
  void show()
}

function onMenuKey(event: KeyboardEvent) {
  const index = menuItems().findIndex((item) => item === document.activeElement)
  const moves: Record<string, number> = {
    ArrowDown: index + 1,
    ArrowUp: index - 1,
    Home: 0,
    End: props.accounts.length - 1,
  }
  if (event.key in moves) {
    event.preventDefault()
    focusItem(moves[event.key])
  } else if (event.key === 'Escape') {
    event.preventDefault()
    close(true)
  } else if (event.key === 'Tab') {
    close(false)
  }
}

function choose(account: SavedAccount) {
  if (!isCurrent(account)) emit('switch', account)
  close(true)
}

// A press anywhere outside the switcher closes the menu, leaving focus where it lands.
function onOutside(event: Event) {
  if (!event.composedPath().some((target) => target === root.value)) close(false)
}
watch(open, (now) => {
  if (now) document.addEventListener('pointerdown', onOutside, true)
  else document.removeEventListener('pointerdown', onOutside, true)
})
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside, true))
</script>

<template>
  <div ref="root" class="switcher">
    <button
      ref="toggle"
      type="button"
      class="toggle"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-controls="open ? menuId : undefined"
      :aria-label="`Switch account. Current: UID ${current.uid}, ${serverName(current.server)} server`"
      @click="open ? close(false) : show()"
      @keydown="onButtonKey"
    >
      <span class="label" aria-hidden="true">UID</span>
      <span class="uid" aria-hidden="true">{{ current.uid }}</span>
      <span class="server" aria-hidden="true">{{ serverName(current.server) }}</span>
      <ChevronDown :size="14" class="chevron" aria-hidden="true" />
    </button>
    <div
      v-if="open"
      :id="menuId"
      class="menu"
      role="menu"
      aria-label="Saved accounts"
      @keydown="onMenuKey"
    >
      <span class="heading" aria-hidden="true">Saved accounts</span>
      <button
        v-for="account in accounts"
        :key="`${account.uid}@${account.server}`"
        ref="items"
        type="button"
        class="item"
        role="menuitemradio"
        tabindex="-1"
        :aria-checked="isCurrent(account)"
        @click="choose(account)"
      >
        <span class="mark"><Check v-if="isCurrent(account)" :size="14" aria-hidden="true" /></span>
        <span class="who">
          <span class="uid">{{ account.uid }}</span>
          <span class="server">{{ serverName(account.server) }}</span>
        </span>
        <span class="rolls">{{ plural(account.rolls, 'roll') }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.switcher {
  position: relative;
}
.toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 40px;
  padding: 0 12px 0 14px;
  border: 1px solid var(--rim);
  border-radius: 8px;
  background: var(--panel);
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.toggle[aria-expanded='true'] {
  background: var(--control);
}
.label {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
}
.uid {
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
.server {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--panel-rim);
  color: var(--text-secondary);
  font-size: 12px;
  white-space: nowrap;
}
.chevron {
  color: var(--text-secondary);
}
.menu {
  position: absolute;
  z-index: 40;
  top: calc(100% + 8px);
  right: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: max-content;
  min-width: 100%;
  max-width: calc(100vw - 2 * var(--gutter));
  max-height: 60vh;
  overflow-y: auto;
  padding: 6px;
  border: 1px solid var(--rim-strong);
  border-radius: 12px;
  background: var(--selected);
  box-shadow: 0 12px 32px rgb(0 0 0 / 45%);
}
.heading {
  padding: 8px 10px 6px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
}
.item {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 0 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.item:hover,
.item:focus-visible,
.item[aria-checked='true'] {
  background: var(--control);
}
.mark {
  display: flex;
  color: var(--accent);
}
.who {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.rolls {
  color: var(--text-muted);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
