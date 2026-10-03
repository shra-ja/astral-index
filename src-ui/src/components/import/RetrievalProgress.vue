<script setup lang="ts">
// Presentational: retrieval's progress. Finding and checking the link happen in one
// native step, so both are marked together; the live status says what is happening.
// Cancel takes focus as this appears and reports the user's choice.
import { computed, onMounted, useTemplateRef } from 'vue'
import type { Source, Stage } from '../../composables/useRetrieval'

const props = defineProps<{
  term: string
  source: Source
  stage: Stage
  status: string
  cancelling: boolean
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
    { label: 'Prepare the review', state: 'waiting' },
  ]
})

const cancelButton = useTemplateRef('cancelButton')
onMounted(() => cancelButton.value!.focus())
</script>

<template>
  <section class="progress" aria-labelledby="progress-heading">
    <div class="intro">
      <h2 id="progress-heading">Retrieving {{ term }} History</h2>
      <p>Nothing is saved until you review and confirm.</p>
    </div>
    <ol>
      <li v-for="step in steps" :key="step.label" :data-state="step.state">
        <span class="marker" aria-hidden="true"></span>
        <span class="label">{{ step.label }}</span>
      </li>
    </ol>
    <p class="status" role="status" aria-live="polite" aria-atomic="true">{{ status }}</p>
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
ol {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin: 0;
  padding: 0;
  list-style: none;
}
li {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-soft);
  font-size: 15px;
}
li[data-state='waiting'] {
  color: var(--text-muted);
}
li[data-state='active'] .label {
  color: var(--text);
  font-weight: 600;
}
.marker {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border: 2px solid var(--rim);
  border-radius: 50%;
}
li[data-state='active'] .marker {
  border-top-color: var(--accent);
  border-right-color: var(--accent);
  animation: spin 1s linear infinite;
}
li[data-state='done'] .marker {
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
  li[data-state='active'] .marker {
    animation: none;
  }
}
</style>
