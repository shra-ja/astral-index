<script setup lang="ts">
// Presentational: why the history can't be used and how to use it again (feature
// 0037). It names the copy kept before the failed upgrade, and asks with events to
// open the data folder, report the problem or restore a backup; the caller restores
// and reports how a choice failed, which its status region announces.
import { useTemplateRef } from 'vue'
import FailureSummary from '../shared/FailureSummary.vue'
import StatusCard from '../shared/StatusCard.vue'
import StatusLine from '../shared/StatusLine.vue'

defineProps<{ copy: string | null; checking: boolean; failure?: string | null }>()
const emit = defineEmits<{ reveal: []; report: []; restore: [] }>()
const explanation =
  'This version of Astral Index stores history in a new format, and your existing history failed to upgrade automatically to support it. Nothing was changed, but your history can’t be shown or added to until this is fixed.'
const restoreButton = useTemplateRef('restoreButton')
defineExpose({
  /** Focus the button that chose a backup, once its confirmation closes. */
  focus: () => restoreButton.value!.focus(),
})
</script>

<template>
  <StatusCard role="alert" aria-labelledby="unavailable-heading">
    <FailureSummary
      id="unavailable-heading"
      title="Your History Couldn’t Be Upgraded"
      :message="explanation"
    />

    <div class="copy">
      <template v-if="copy">
        <h3>A copy was kept before the upgrade</h3>
        <p>
          <span class="name">{{ copy }}</span
          >, in the data folder beside your history.
        </p>
      </template>
      <template v-else>
        <h3>No copy could be kept</h3>
        <p>Your history itself is unchanged, in the data folder.</p>
      </template>
      <button type="button" class="link" @click="emit('reveal')">Open folder</button>
    </div>

    <div class="steps">
      <h3>To use your history again</h3>
      <ol>
        <li>
          If you’ve just updated Astral Index, reinstall the version you used before. Your history
          is unchanged, so it opens there as it did.
        </li>
        <li>Report this problem, so it can be fixed in the next version.</li>
        <li>Or restore a backup, which replaces this history and keeps it as a safety copy.</li>
      </ol>
    </div>

    <div class="actions">
      <div class="buttons">
        <button type="button" @click="emit('report')">Report this problem</button>
        <button
          ref="restoreButton"
          type="button"
          class="secondary"
          :disabled="checking"
          aria-describedby="unavailable-status"
          @click="emit('restore')"
        >
          {{ checking ? 'Checking backup…' : 'Restore a backup…' }}
        </button>
      </div>
      <div id="unavailable-status" role="status">
        <StatusLine v-if="failure" tone="failed">{{ failure }}</StatusLine>
      </div>
    </div>
  </StatusCard>
</template>

<style scoped>
.copy,
.steps,
.actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.steps,
.actions {
  gap: 10px;
}
h3 {
  margin: 0;
  color: var(--text-soft);
  font-size: 13px;
  font-weight: 600;
}
.copy p {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.5;
}
.copy {
  padding: 16px 20px;
  border: 1px solid var(--panel-rim);
  border-radius: 10px;
  background: var(--list);
}
.copy p,
ol {
  font-size: 14px;
}
.name {
  color: var(--text);
  overflow-wrap: anywhere;
}
.link {
  align-self: flex-start;
  margin-top: 4px;
  padding: 0;
  border: 0;
  color: var(--accent);
  background: none;
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}
ol {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding-left: 20px;
  color: var(--text-secondary);
  line-height: 1.5;
}
.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
#unavailable-status {
  min-height: 20px;
}
</style>
