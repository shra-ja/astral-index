<script setup lang="ts">
// Presentational: why an import failed and what to do next. A device search can be
// tried again, and a cache file chosen instead after either way of retrieving; another
// history file can be chosen after one failed. Back returns to the start.
import type { Source } from '../../composables/useRetrieval'
import CachePicker from '../shared/CachePicker.vue'
import FailureSummary from '../shared/FailureSummary.vue'
import StatusCard from '../shared/StatusCard.vue'

// `busy` is set while a file's dialog is open or a history file is read, when nothing
// can start.
defineProps<{ title: string; message: string; source: Source; busy?: boolean }>()
const emit = defineEmits<{ retry: []; choose: []; import: []; back: [] }>()
</script>

<template>
  <!-- The end-to-end tests find the card by its class. -->
  <StatusCard class="failed" role="alert" aria-labelledby="failed-heading">
    <FailureSummary id="failed-heading" :title :message />
    <div class="buttons">
      <button
        v-if="source === 'device'"
        type="button"
        :aria-disabled="busy || undefined"
        @click="emit('retry')"
      >
        Try again
      </button>
      <button
        v-if="source === 'file'"
        type="button"
        :aria-disabled="busy || undefined"
        @click="emit('import')"
      >
        Choose another file…
      </button>
      <CachePicker v-else id="retry-cache-file" :busy @choose="emit('choose')" />
      <button type="button" class="back" @click="emit('back')">Back</button>
    </div>
  </StatusCard>
</template>

<style scoped>
.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.back {
  color: var(--text-secondary);
  background: none;
}
</style>
