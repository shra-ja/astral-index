<script setup lang="ts">
// The Import screen. Star Rail offers retrieval; Genshin Impact's is coming soon.
// The retrieval flow's state comes from the shell, so it survives leaving this
// screen; this view wires it to the components and moves focus as the flow changes.
import { inject, useTemplateRef, watch } from 'vue'
import RetrievalStart from '../components/RetrievalStart.vue'
import ReviewPanel from '../components/ReviewPanel.vue'
import ScreenHeader from '../components/ScreenHeader.vue'
import { retrievalKey } from '../composables/retrieval'
import { games, type Game } from '../format'

defineProps<{ game: Game }>()
const {
  phase,
  source,
  status,
  review,
  cancelling,
  searchDevice,
  readFile,
  cancel,
  save,
  discard,
  done,
} = inject(retrievalKey)!
const start = useTemplateRef('start')
const cancelButton = useTemplateRef('cancelButton')

// Cancel takes focus while retrieval runs; the control that started it gets focus
// back when it ends. The review takes focus itself as it appears.
watch(
  phase,
  (now) => {
    if (now === 'acquiring') cancelButton.value!.focus()
    if (now === 'idle') start.value!.focus(source.value)
  },
  { flush: 'post' },
)
</script>

<template>
  <main>
    <ScreenHeader title="Import" :game="games[game]" />
    <div class="body">
      <p class="soon" :hidden="game === 'honkai-star-rail'">
        Retrieval for {{ games[game] }} is coming soon.
      </p>
      <div
        class="retrieval"
        :aria-busy="phase === 'acquiring' || phase === 'saving'"
        :hidden="game !== 'honkai-star-rail'"
      >
        <RetrievalStart
          ref="start"
          :hidden="phase !== 'idle'"
          @search="searchDevice"
          @choose="readFile"
        />
        <p class="extraction-status" role="status" aria-live="polite" aria-atomic="true">
          {{ status }}
        </p>
        <button
          ref="cancelButton"
          type="button"
          class="cancel secondary"
          :hidden="phase !== 'acquiring'"
          :disabled="cancelling"
          @click="cancel"
        >
          Cancel
        </button>
        <ReviewPanel
          v-if="review"
          :review
          :busy="phase !== 'reviewing'"
          @save="save"
          @discard="discard"
          @done="done"
        />
      </div>
    </div>
  </main>
</template>

<style scoped>
.body {
  flex-grow: 1;
  padding: clamp(24px, 4vh, 40px) var(--gutter);
  overflow-y: auto;
}
.soon {
  color: var(--text-secondary);
  font-size: 15px;
}
.retrieval {
  max-width: 640px;
  padding: 28px 24px 32px;
  border: 1px solid var(--rim);
  border-radius: 14px;
  background: var(--panel);
  text-align: center;
}
.extraction-status {
  max-width: 460px;
  margin: 20px auto 0;
  color: var(--text-soft);
  line-height: 1.5;
}
.extraction-status:empty {
  display: none;
}
.cancel {
  margin-top: 16px;
}
</style>
