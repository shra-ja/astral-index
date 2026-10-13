<script setup lang="ts">
// Presentational: the About dialog, a modal over the current screen. Its main view
// can swap to the licence or the third-party notices, each with Back and Close. Close,
// Esc, the openings and the notices are asked for with events; the caller removes the
// dialog.
import { ChevronLeft, X } from '@lucide/vue'
import { nextTick, onMounted, shallowRef, useTemplateRef, type DeepReadonly } from 'vue'
import licence from '../../../../LICENSE?raw'
import type { AppInfo } from '../../commands'
import type { Opening } from '../../composables/useAbout'
import type { Notices } from '../../notices'
import AboutSummary from './AboutSummary.vue'
import NoticesList from './NoticesList.vue'

defineProps<{
  info: AppInfo | null
  failed: Opening | null
  notices: DeepReadonly<Notices> | null
  noticesMissing: boolean
}>()
const emit = defineEmits<{ close: []; reveal: []; issues: []; notices: [] }>()

type View = 'main' | 'licence' | 'notices'
const titles = { licence: 'Licence', notices: 'Third-Party Notices' }
// The footer button that opened each view, so Back returns to it.
const openers = { licence: 'Licence Text', notices: 'Third-Party Notices' }
const view = shallowRef<View>('main')
const dialog = useTemplateRef('dialog')
const back = useTemplateRef('back')

onMounted(() => dialog.value!.showModal())

async function show(next: Exclude<View, 'main'>) {
  if (next === 'notices') emit('notices')
  view.value = next
  await nextTick()
  back.value!.focus()
}
async function returnFrom(current: Exclude<View, 'main'>) {
  view.value = 'main'
  await nextTick()
  const opener = [...dialog.value!.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === openers[current],
  )
  opener!.focus()
}
</script>

<template>
  <dialog ref="dialog" class="about" aria-label="About Astral Index" @close="emit('close')">
    <template v-if="view === 'main'">
      <button type="button" class="close corner" aria-label="Close" @click="emit('close')">
        <X :size="18" aria-hidden="true" />
      </button>
      <div class="body">
        <AboutSummary
          :info
          :failed
          @reveal="emit('reveal')"
          @issues="emit('issues')"
          @licence="show('licence')"
          @notices="show('notices')"
        />
      </div>
    </template>
    <template v-else>
      <div class="bar">
        <button ref="back" type="button" class="back" @click="returnFrom(view)">
          <ChevronLeft :size="16" aria-hidden="true" />
          Back
        </button>
        <h2>{{ titles[view] }}</h2>
        <button type="button" class="close" aria-label="Close" @click="emit('close')">
          <X :size="18" aria-hidden="true" />
        </button>
      </div>
      <div class="body">
        <p v-if="view === 'licence'" class="licence">{{ licence.trim() }}</p>
        <NoticesList v-else :notices :missing="noticesMissing" />
      </div>
    </template>
  </dialog>
</template>

<style scoped>
/* Up to 600 px wide and never taller than the window, less the gutter either side;
   the body scrolls, so the dialog fits the 480×560 minimum window. */
.about {
  container-type: inline-size;
  flex-direction: column;
  width: calc(100% - 2 * var(--gutter));
  max-width: 600px;
  max-height: calc(100% - 2 * var(--gutter));
  padding: 0;
  border: 1px solid var(--rim-strong);
  border-radius: 16px;
  color: var(--text);
  background: var(--panel);
  box-shadow: 0 24px 64px rgb(0 0 0 / 50%);
}
.about[open] {
  display: flex;
}
.about::backdrop {
  background: rgb(5 7 10 / 62%);
}
.body {
  min-height: 0;
  overflow-y: auto;
  padding: 20px 28px 24px;
}
/* On the main view, Close sits in the corner above the lockup's clear space. */
.corner {
  position: absolute;
  top: 12px;
  right: 12px;
}
.corner + .body {
  padding-top: 56px;
}
.bar {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid var(--panel-rim);
}
.bar h2 {
  flex-grow: 1;
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.close,
.back {
  justify-content: center;
  min-width: 44px;
  padding: 0 10px;
  color: var(--text-soft);
  background: transparent;
  font-size: 14px;
  font-weight: 500;
}
.close {
  padding: 0;
}
.close svg,
.back svg {
  color: var(--text-secondary);
}
.licence {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-line;
}
</style>
