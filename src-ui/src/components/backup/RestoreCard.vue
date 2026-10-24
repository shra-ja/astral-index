<script setup lang="ts">
// Presentational: the Restore card. Asks for a backup to restore with an event; the
// caller chooses and checks it, and reports how the choice or the restore ended,
// which a status region announces.
import { RotateCcwClock } from '@lucide/vue'
import { useTemplateRef } from 'vue'
import type { RestoreOutcome } from '../../composables/useRestore'
import ActionCard from '../shared/ActionCard.vue'
import StatusLine from '../shared/StatusLine.vue'

defineProps<{ checking: boolean; outcome?: RestoreOutcome | null }>()
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
    :icon="RotateCcwClock"
  >
    <template #actions>
      <button
        ref="button"
        type="button"
        class="secondary"
        :disabled="checking"
        @click="emit('choose')"
      >
        {{ checking ? 'Checking backup…' : 'Restore from backup…' }}
      </button>
    </template>
    <template #status>
      <StatusLine v-if="outcome?.kind === 'restored'" tone="done"
        >Restored <span class="name">{{ outcome.name }}</span
        >.<template v-if="outcome.safetyCopy">
          Your previous history is kept in the data folder as
          <span class="name">{{ outcome.safetyCopy }}</span
          >.</template
        ></StatusLine
      >
      <StatusLine v-else-if="outcome" tone="failed">{{ outcome.message }}</StatusLine>
    </template>
  </ActionCard>
</template>

<style scoped>
.name {
  color: var(--text-soft);
  overflow-wrap: anywhere;
}
</style>
