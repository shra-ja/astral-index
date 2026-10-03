<script setup lang="ts">
// Presentational: retrieval's progress. Finding and checking the link happen in one
// native step, so both are marked together. While downloading, a summary row, a bar
// and each category's pages show how far it has got, in the order categories are
// requested; the live status still announces each step, and is shown only when the
// row can't say it (before the first page, during a retry wait, while cancelling).
// Cancel takes focus as this appears and reports the user's choice.
import { computed, onMounted, useTemplateRef } from 'vue'
import type { Download, Source, Stage } from '../../composables/useRetrieval'
import { plural, retrievalOrder, warps } from '../../format'

const props = defineProps<{
  term: string
  source: Source
  stage: Stage
  status: string
  cancelling: boolean
  download?: Download
}>()
const emit = defineEmits<{ cancel: [] }>()

type State = 'waiting' | 'active' | 'done'
const steps = computed((): { label: string; state: State }[] => {
  const found = props.stage === 'downloading'
  const where = props.source === 'device' ? 'the game files' : 'the provided file'
  const link = `${props.term.toLowerCase()} history link in ${where}`
  const finding = found ? 'done' : 'active'
  return [
    { label: found ? `Found the ${link}` : `Find the ${link}`, state: finding },
    {
      label: found ? 'Checked the link with HoYoverse' : 'Check the link with HoYoverse',
      state: finding,
    },
    {
      label: found ? 'Downloading your rolls' : 'Download your rolls',
      state: found ? 'active' : 'waiting',
    },
    { label: 'Prepare the review', state: 'waiting' as const },
  ]
})

// How far the download has got: the categories before the current one are done.
const reached = computed(() => {
  const { download } = props
  if (!download) return undefined
  const current = retrievalOrder.indexOf(download.category)
  const rows = retrievalOrder.map((gacha_type, index) => {
    // Each category by its full name, as the game shows it.
    const category = { gacha_type, label: warps[gacha_type] }
    // Retrieval requests page 1 of every category, so a done one should have pages;
    // if one was skipped, show no count rather than fail.
    const pages = download.pages[gacha_type]
    if (index < current) {
      const done = pages === undefined ? '—' : plural(pages, 'page')
      return { ...category, pages: done, state: 'done' as const }
    }
    if (index === current)
      return { ...category, pages: `page ${download.page}`, state: 'active' as const }
    return { ...category, pages: '—', state: 'waiting' as const }
  })
  return { current, records: download.records, rows }
})
const statusShown = computed(() => !reached.value || props.download!.retrying || props.cancelling)
const stateText = { done: 'Done', active: 'Downloading…', waiting: 'Waiting' }

const cancelButton = useTemplateRef('cancelButton')
onMounted(() => cancelButton.value!.focus())
</script>

<template>
  <section class="progress" aria-labelledby="progress-heading">
    <div class="intro">
      <h2 id="progress-heading">Retrieving {{ term }} History</h2>
      <p>Nothing is saved until you review and confirm.</p>
    </div>
    <div v-if="reached" class="overall">
      <p class="summary">
        <span>Category {{ reached.current + 1 }} of {{ reached.rows.length }}</span>
        <!-- Keeps the two parts apart when read as text. -->
        {{ ' ' }}
        <span class="records">{{ plural(reached.records, 'roll') }} so far</span>
      </p>
      <div
        class="bar"
        role="progressbar"
        aria-label="Categories downloaded"
        aria-valuemin="0"
        :aria-valuemax="reached.rows.length"
        :aria-valuenow="reached.current"
        :aria-valuetext="`Category ${reached.current + 1} of ${reached.rows.length}`"
      >
        <span :style="{ width: `${(100 * reached.current) / reached.rows.length}%` }"></span>
      </div>
    </div>
    <ol class="steps">
      <li v-for="(step, index) in steps" :key="step.label" :data-state="step.state">
        <span class="marker" aria-hidden="true"></span>
        <span class="label">{{ step.label }}</span>
        <ul v-if="index === 2 && reached" class="categories">
          <li v-for="row in reached.rows" :key="row.gacha_type" :data-state="row.state">
            <span class="name">{{ row.label }}</span>
            <span class="pages" :aria-hidden="row.state === 'waiting'">{{ row.pages }}</span>
            <span class="state">{{ stateText[row.state] }}</span>
          </li>
        </ul>
      </li>
    </ol>
    <p
      class="status"
      :class="{ 'visually-hidden': !statusShown }"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {{ status }}
    </p>
    <div class="footer">
      <span>Cancelling keeps your saved history unchanged.</span>
      <button
        ref="cancelButton"
        type="button"
        class="cancel secondary"
        :disabled="cancelling"
        @click="emit('cancel')"
      >
        Cancel
      </button>
    </div>
  </section>
</template>

<style scoped>
.progress {
  display: flex;
  flex-direction: column;
  gap: 24px;
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
  padding: 32px;
  border: 1px solid var(--rim);
  border-radius: 14px;
  background: var(--panel);
}
.intro {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}
.intro p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 15px;
}
.overall {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.summary {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 4px 16px;
  margin: 0;
  color: var(--text-soft);
  font-size: 14px;
}
.records {
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}
.bar {
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--panel-rim);
}
.bar span {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--accent);
  transition: width 0.3s ease;
}
.steps {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin: 0;
  padding: 0;
  list-style: none;
}
/* The marker beside the label, with a step's details below the label. */
.steps > li {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  color: var(--text-soft);
  font-size: 15px;
}
.steps > li[data-state='waiting'] {
  color: var(--text-muted);
}
.steps > li[data-state='active'] .label {
  color: var(--text);
  font-weight: 600;
}
.categories {
  grid-column: 2;
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--panel-rim);
  border-radius: 10px;
  list-style: none;
}
.categories li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(96px, auto);
  align-items: center;
  column-gap: 16px;
  min-height: 40px;
  padding: 0 16px;
  color: var(--text-soft);
  font-size: 14px;
  font-weight: 400;
}
.categories li + li {
  border-top: 1px solid var(--panel-rim);
}
.categories .pages {
  color: var(--text-muted);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.categories .state {
  justify-self: end;
  font-size: 13px;
  font-weight: 500;
}
.categories [data-state='done'] .state {
  color: var(--accent);
}
.categories [data-state='active'] {
  background: var(--selected);
  color: var(--text);
}
.categories [data-state='waiting'],
.categories [data-state='waiting'] .state {
  color: var(--text-muted);
}
.marker {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border: 2px solid var(--rim);
  border-radius: 50%;
}
.steps > li[data-state='active'] .marker {
  border-top-color: var(--accent);
  border-right-color: var(--accent);
  animation: spin 1s linear infinite;
}
.steps > li[data-state='done'] .marker {
  border-color: var(--accent);
  background: var(--accent-tint);
}
.status {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
.footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 20px;
  border-top: 1px solid var(--panel-rim);
  color: var(--text-muted);
  font-size: 13px;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .steps > li[data-state='active'] .marker {
    animation: none;
  }
}
</style>
