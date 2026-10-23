<script setup lang="ts">
// Presentational: why retrieval failed and what to do next. A device search can be
// tried again; a cache file can be chosen instead either way. Back returns to the
// start.
import type { Source } from '../../composables/useRetrieval'
import CachePicker from '../shared/CachePicker.vue'
import FailureSummary from '../shared/FailureSummary.vue'
import StatusCard from '../shared/StatusCard.vue'

// `busy` is set while the cache file's dialog is open, when nothing can start.
defineProps<{ title: string; message: string; source: Source; busy?: boolean }>()
const emit = defineEmits<{ retry: []; choose: []; back: [] }>()
</script>

<template>
  <StatusCard class="failed" role="alert" aria-labelledby="failed-heading">
    <FailureSummary id="failed-heading" :title>
      <p>{{ message }}</p>
    </FailureSummary>
    <div class="buttons">
      <button
        v-if="source === 'device'"
        type="button"
        :aria-disabled="busy || undefined"
        @click="emit('retry')"
      >
        Try again
      </button>
      <CachePicker id="retry-cache-file" :busy @choose="emit('choose')" />
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
