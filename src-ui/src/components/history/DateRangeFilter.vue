<script setup lang="ts">
// Presentational: the rolls panel's date filter, a button naming the days shown
// that opens a popover of quick ranges and From and To fields. Every change is
// emitted at once; Done, Escape, a press outside or Tab out close it.
import { CalendarDays } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, ref, useId, useTemplateRef, watch } from 'vue'
import { dateRangeLabel, quickRanges, type DateRange } from '../../format'

const props = defineProps<{
  from?: string
  to?: string
  /** Today's server date, which quick ranges count back from. */
  today: string
  /** The server's offset, such as "UTC+8", or "server time" when unknown. */
  offset: string
  /** The saved rolls' period, when there are any. */
  span?: string
}>()
const emit = defineEmits<{ change: [range: DateRange] }>()

const open = ref(false)
const dialogId = useId()
const root = useTemplateRef('root')
const toggle = useTemplateRef('toggle')
const ranges = useTemplateRef<HTMLButtonElement[]>('ranges')

const label = computed(() => dateRangeLabel(props.from, props.to, props.today))
const quick = computed(() =>
  quickRanges(props.today).map((range) => ({
    ...range,
    pressed: range.from === props.from && range.to === props.to,
  })),
)
const note = computed(() => {
  const zone = props.offset === 'server time' ? 'Server time.' : `Server time (${props.offset}).`
  return props.span ? `${zone} Saved rolls span ${props.span}.` : zone
})

/** Open the popover with focus on the range shown, or the first. */
async function show() {
  open.value = true
  await nextTick()
  const shown = ranges.value as HTMLButtonElement[]
  ;(shown[quick.value.findIndex((range) => range.pressed)] ?? shown[0])?.focus()
}

function close(refocus: boolean) {
  open.value = false
  if (refocus) toggle.value?.focus()
}

function onKey(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  event.preventDefault()
  close(true)
}

// Focus moving to somewhere outside the filter closes it.
function onFocusOut(event: FocusEvent) {
  const next = event.relatedTarget
  if (next instanceof Node && !root.value?.contains(next)) close(false)
}

// A press anywhere outside the filter closes it, leaving focus where it lands.
function onOutside(event: Event) {
  if (!event.composedPath().some((target) => target === root.value)) close(false)
}
watch(open, (now) => {
  if (now) document.addEventListener('pointerdown', onOutside, true)
  else document.removeEventListener('pointerdown', onOutside, true)
})
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside, true))

const day = (event: Event) => (event.target as HTMLInputElement).value || undefined
</script>

<template>
  <div ref="root" class="dates">
    <button
      ref="toggle"
      type="button"
      class="toggle"
      :class="{ active: from || to }"
      aria-haspopup="dialog"
      :aria-expanded="open"
      :aria-controls="open ? dialogId : undefined"
      :aria-label="`Dates shown: ${label}`"
      @click="open ? close(false) : show()"
    >
      <CalendarDays :size="15" aria-hidden="true" />
      <span>{{ label }}</span>
    </button>
    <div
      v-if="open"
      :id="dialogId"
      class="popover"
      role="dialog"
      aria-label="Date range"
      @keydown="onKey"
      @focusout="onFocusOut"
    >
      <div class="quick" role="group" aria-label="Quick ranges">
        <button
          v-for="range in quick"
          ref="ranges"
          :key="range.label"
          type="button"
          :aria-pressed="range.pressed"
          @click="emit('change', { from: range.from, to: range.to })"
        >
          {{ range.label }}
        </button>
      </div>
      <div class="fields">
        <label>
          From
          <input
            type="date"
            :value="from ?? ''"
            :max="to"
            @change="emit('change', { from: day($event), to })"
          />
        </label>
        <label>
          To
          <input
            type="date"
            :value="to ?? ''"
            :min="from"
            @change="emit('change', { from, to: day($event) })"
          />
        </label>
      </div>
      <p class="note">{{ note }}</p>
      <div class="actions">
        <button type="button" class="clear" @click="emit('change', {})">Clear</button>
        <button type="button" class="done" @click="close(true)">Done</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dates {
  position: relative;
}
.toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--rim);
  border-radius: 9px;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}
.toggle.active {
  border-color: var(--accent);
  background: var(--accent-tint);
  color: var(--accent);
}
.popover {
  position: absolute;
  z-index: 30;
  top: calc(100% + 8px);
  left: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 320px;
  max-width: calc(100vw - 2 * var(--gutter));
  padding: 16px;
  border: 1px solid var(--rim-strong);
  border-radius: 12px;
  background: var(--selected);
  box-shadow: 0 12px 32px rgb(0 0 0 / 45%);
}
.quick {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.quick button {
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--rim);
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.quick button[aria-pressed='true'] {
  border-color: var(--accent);
  background: var(--accent-tint);
  color: var(--accent);
}
.fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.fields label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
}
.fields input {
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--rim);
  border-radius: 9px;
  background: var(--window);
  color: var(--text);
  font: inherit;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.note {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 17px;
}
.actions {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.actions button {
  height: 32px;
  padding: 0 12px;
  border-radius: 8px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.clear {
  border: 1px solid var(--rim);
  background: none;
  color: var(--text-soft);
  font-weight: 500;
}
.done {
  border: none;
  background: var(--accent);
  color: var(--accent-ink);
  font-weight: 600;
}
</style>
