<script setup lang="ts">
// The Import screen: the sources, then retrieval's progress or a history file's
// accounts, then the review and outcome, one screen at a time. Only Star Rail has
// imports; Genshin Impact's sources say they are coming soon. The flow's state comes
// from the shell, so it survives leaving this screen. Each step focuses itself as it
// appears; the start refocuses the control that began the import when it returns.
import { computed, inject, useTemplateRef, watch } from 'vue'
import { RouterLink } from 'vue-router'
import FileAccounts from '../components/import/FileAccounts.vue'
import ImportFailed from '../components/import/ImportFailed.vue'
import ImportSaved from '../components/import/ImportSaved.vue'
import ImportSources from '../components/import/ImportSources.vue'
import LastImport from '../components/import/LastImport.vue'
import RetrievalProgress from '../components/import/RetrievalProgress.vue'
import ReviewPanel from '../components/import/ReviewPanel.vue'
import ScreenHeader from '../components/layout/ScreenHeader.vue'
import { importFlowKey } from '../composables/importFlow'
import { useLastImport } from '../composables/useLastImport'
import { games, terms, type Game } from '../format'

const props = defineProps<{ game: Game }>()
const {
  phase,
  source,
  origin,
  mode,
  stage,
  status,
  download,
  review,
  outcome,
  cancelling,
  searchDevice,
  chooseCache,
  importFile,
  busy,
  fileName,
  accounts,
  reviewAccount,
  closeFile,
  cancel,
  save,
  discard,
  done,
  dismiss,
  chooseMode,
} = inject(importFlowKey)!

const available = computed(() => props.game === 'honkai-star-rail')
const step = computed(() => {
  if (!available.value) return 'start'
  if (phase.value === 'acquiring') return 'progress'
  if (accounts.value) return 'accounts'
  if (review.value) return 'review'
  return outcome.value?.kind === 'saved' || outcome.value?.kind === 'failed'
    ? outcome.value.kind
    : 'start'
})
const note = computed(() =>
  available.value && outcome.value?.kind === 'note' ? outcome.value.message : undefined,
)

// The last import is read whenever Star Rail's sources appear, so it follows each save.
const { last, refresh } = useLastImport()
watch(
  () => available.value && step.value === 'start',
  (shown) => {
    if (shown) void refresh()
  },
  { immediate: true },
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
        :mode
        :busy="busy"
        @update:mode="chooseMode"
        @search="searchDevice"
        @choose="chooseCache"
        @import="importFile"
      >
        <LastImport v-if="available && last" :last />
      </ImportSources>
      <RetrievalProgress
        v-else-if="step === 'progress'"
        :term="terms[game]"
        :source
        :stage
        :status
        :download
        :cancelling
        @cancel="cancel"
      />
      <FileAccounts
        v-else-if="step === 'accounts'"
        :name="fileName!"
        :contents="accounts!"
        :busy="phase !== 'picking'"
        @review="reviewAccount"
        @cancel="closeFile"
      />
      <ReviewPanel
        v-else-if="step === 'review'"
        :review="review!"
        :origin
        :file-name="fileName"
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
        :busy="busy"
        @retry="searchDevice"
        @choose="chooseCache"
        @import="importFile"
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
  padding: clamp(24px, 4vh, 40px) var(--content-pad);
  overflow-y: auto;
}
/* The review and the file's accounts lay out their own scrolling body and fixed footer. */
.retrieval.review,
.retrieval.accounts {
  padding: 0;
  overflow: hidden;
}
</style>
