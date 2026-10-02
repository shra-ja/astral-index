<script setup lang="ts">
// The Import screen: the sources, then retrieval's progress, review and outcome, one
// screen at a time. Only Star Rail has retrieval; Genshin Impact's sources say it is
// coming soon. The flow's state comes from the shell, so it survives leaving this
// screen. Each step focuses itself as it appears; the start refocuses the control
// that began retrieval when it returns.
import { computed, inject, useTemplateRef, watch } from 'vue'
import { RouterLink } from 'vue-router'
import ImportFailed from '../components/ImportFailed.vue'
import ImportSaved from '../components/ImportSaved.vue'
import ImportSources from '../components/ImportSources.vue'
import RetrievalProgress from '../components/RetrievalProgress.vue'
import ReviewPanel from '../components/ReviewPanel.vue'
import ScreenHeader from '../components/ScreenHeader.vue'
import { retrievalKey } from '../composables/retrieval'
import { games, terms, type Game } from '../format'

const props = defineProps<{ game: Game }>()
const {
  phase,
  source,
  stage,
  status,
  review,
  outcome,
  cancelling,
  searchDevice,
  readFile,
  cancel,
  save,
  discard,
  done,
  dismiss,
} = inject(retrievalKey)!

const available = computed(() => props.game === 'honkai-star-rail')
const step = computed(() => {
  if (!available.value) return 'start'
  if (phase.value === 'acquiring') return 'progress'
  if (review.value) return 'review'
  return outcome.value?.kind === 'saved' || outcome.value?.kind === 'failed'
    ? outcome.value.kind
    : 'start'
})
const note = computed(() =>
  available.value && outcome.value?.kind === 'note' ? outcome.value.message : undefined,
)

const sources = useTemplateRef('sources')
watch(
  step,
  (now) => {
    if (now === 'start') sources.value!.focus(source.value)
  },
  { flush: 'post' },
)
</script>

<template>
  <main>
    <ScreenHeader :title="step === 'review' ? 'Review Import' : 'Import'" :game="games[game]" />
    <div class="retrieval" :class="step" :aria-busy="phase === 'acquiring' || phase === 'saving'">
      <ImportSources
        v-if="step === 'start'"
        ref="sources"
        :term="terms[game]"
        :game="games[game]"
        :available
        :note
        @search="searchDevice"
        @choose="readFile"
      />
      <RetrievalProgress
        v-else-if="step === 'progress'"
        :term="terms[game]"
        :source
        :stage
        :status
        :cancelling
        @cancel="cancel"
      />
      <ReviewPanel
        v-else-if="step === 'review'"
        :review="review!"
        :busy="phase !== 'reviewing'"
        @save="save"
        @discard="discard"
        @done="done"
      />
      <ImportSaved v-else-if="outcome?.kind === 'saved'" :saved="outcome" @done="dismiss">
        <RouterLink class="button" :to="{ name: 'history', params: { game } }" @click="dismiss">
          View {{ terms[game].toLowerCase() }} history
        </RouterLink>
      </ImportSaved>
      <ImportFailed
        v-else-if="outcome?.kind === 'failed'"
        :title="outcome.title"
        :message="outcome.message"
        :source
        @retry="searchDevice"
        @choose="readFile"
        @back="dismiss"
      />
    </div>
  </main>
</template>

<style scoped>
.retrieval {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  min-height: 0;
  padding: clamp(24px, 4vh, 40px) var(--gutter);
  overflow-y: auto;
}
/* The review lays out its own scrolling body and fixed footer. */
.retrieval.review {
  padding: 0;
  overflow: hidden;
}
</style>
