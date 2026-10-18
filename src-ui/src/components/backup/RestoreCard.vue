<script setup lang="ts">
// Presentational: the Restore card. Asks for a backup to restore with an event; the
// caller chooses and checks it, and reports a refusal, which a status region
// announces.
import { CircleAlert, RotateCcwClock } from '@lucide/vue'
import { useTemplateRef } from 'vue'
import type { RestoreState } from '../../composables/useRestore'
import ActionCard from '../shared/ActionCard.vue'

defineProps<{ state: RestoreState; message?: string | null }>()
const emit = defineEmits<{ choose: [] }>()
const button = useTemplateRef('button')

defineExpose({
  /** Focus the button that chose a backup, once the confirmation closes. */
  focus: () => button.value!.focus(),
})
</script>

<template>
  <ActionCard
    id="restore-title"
    title="Restore"
    text="Replace your saved history with a backup’s. Your current history is kept as a safety copy first."
    :points="[
      'Backups from this or any earlier version of Astral Index',
      'Shows what will change before anything is replaced',
    ]"
  >
    <template #icon><RotateCcwClock :size="22" :stroke-width="1.75" /></template>
    <template #actions>
      <button
        ref="button"
        type="button"
        class="secondary"
        :disabled="state === 'checking'"
        @click="emit('choose')"
      >
        {{ state === 'checking' ? 'Checking backup…' : 'Restore from backup…' }}
      </button>
      <div class="status" role="status">
        <p v-if="message" class="failed">
          <CircleAlert :size="16" :stroke-width="1.75" />
          <span>{{ message }}</span>
        </p>
      </div>
    </template>
  </ActionCard>
</template>

<style scoped>
.status {
  min-height: 20px;
}
.status p {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
}
.status svg {
  flex-shrink: 0;
  margin-top: 1px;
}
.failed {
  color: var(--error);
}
</style>
