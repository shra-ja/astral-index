<script setup lang="ts">
// Presentational: a tooltip in the app's theme for the element in its slot, never the
// browser's `title` (decision 0013). It shows after a short pause under the pointer and
// at once on keyboard focus, stays while the pointer moves onto it, and Escape hides
// it (WCAG 1.4.13). The slot gets the tooltip's id, for an `aria-describedby` when the
// text adds to the element's name.
import { autoUpdate, flip, offset, shift, useFloating, type Placement } from '@floating-ui/vue'
import { computed, onBeforeUnmount, ref, toRef, useId, useTemplateRef, watch } from 'vue'

const props = withDefaults(defineProps<{ text: string; placement?: Placement }>(), {
  placement: 'top',
})

/** How long the pointer rests on the element before the tooltip shows, in ms. */
const showDelay = 400
/** How long the tooltip waits after the pointer leaves, so it can reach the tooltip. */
const hideDelay = 100

const tooltipId = useId()
const anchor = useTemplateRef('anchor')
const tip = useTemplateRef('tip')
// The first slot element is what the tooltip points at; the wrapper has no box.
const target = computed(() => anchor.value?.firstElementChild ?? null)
const { floatingStyles, placement, update } = useFloating(target, tip, {
  placement: toRef(props, 'placement'),
  strategy: 'fixed',
  middleware: [offset(6), flip(), shift({ padding: 8 })],
})

const hovered = ref(false)
const focused = ref(false)
const dismissed = ref(false)
const open = computed(() => (hovered.value || focused.value) && !dismissed.value)

let timer: ReturnType<typeof setTimeout> | undefined
function after(delay: number, change: () => void) {
  clearTimeout(timer)
  timer = setTimeout(change, delay)
}

function onPointerEnter() {
  clearTimeout(timer)
  if (hovered.value) return
  after(showDelay, () => {
    hovered.value = true
    dismissed.value = false
  })
}

function onPointerLeave() {
  after(hideDelay, () => (hovered.value = false))
}

function onFocusIn(event: FocusEvent) {
  // Focus from a press waits for the pointer, like any hover.
  if (!(event.target as Element).matches(':focus-visible')) return
  focused.value = true
  dismissed.value = false
}

function onFocusOut(event: FocusEvent) {
  const next = event.relatedTarget
  if (next instanceof Node && anchor.value?.contains(next)) return
  focused.value = false
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') dismissed.value = true
}

// While shown: follow the element as it moves, and listen for Escape. Measured after
// the tooltip is displayed, since a hidden tooltip has no size.
let stopFollowing: (() => void) | undefined
function stop() {
  stopFollowing?.()
  stopFollowing = undefined
  document.removeEventListener('keydown', onKey)
}
watch(
  open,
  (shown) => {
    if (!shown) return stop()
    stopFollowing = autoUpdate(target.value as Element, tip.value as HTMLElement, update)
    document.addEventListener('keydown', onKey)
  },
  { flush: 'post' },
)
onBeforeUnmount(() => {
  clearTimeout(timer)
  stop()
})
</script>

<template>
  <span
    ref="anchor"
    class="anchor"
    @pointerenter="onPointerEnter"
    @pointerleave="onPointerLeave"
    @focusin="onFocusIn"
    @focusout="onFocusOut"
  >
    <slot :tooltip-id="tooltipId" />
    <span
      v-show="open"
      :id="tooltipId"
      ref="tip"
      role="tooltip"
      class="tooltip"
      :data-placement="placement"
      :style="floatingStyles"
      >{{ text }}</span
    >
  </span>
</template>

<style scoped>
.anchor {
  display: contents;
}
.tooltip {
  z-index: 50;
  display: block;
  width: max-content;
  max-width: min(280px, calc(100vw - 16px));
  padding: 6px 10px;
  border: 1px solid var(--rim-strong);
  border-radius: 8px;
  background: var(--panel-rim);
  color: var(--text);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  white-space: normal;
}
</style>
