<script setup lang="ts">
// Presentational: where history is stored, with a button that asks to show it in its
// folder; the caller opens it and says whether that failed. Until the folder has been
// read it shows nothing, and a failed read is told apart from having no folder. Used
// by the About dialog and the Backup & Restore screen.
import { FolderOpen } from '@lucide/vue'
import type { Read } from '../../composables/useDataFolder'
import { openingFailures } from '../../messages'

defineProps<{ path: string | null; read: Read; failed: boolean }>()
const emit = defineEmits<{ reveal: [] }>()
</script>

<template>
  <div v-if="read !== 'pending'" class="data-folder">
    <p v-if="read === 'failed'" class="note">Where history is stored couldn’t be read.</p>
    <template v-else-if="path">
      <div class="folder">
        <span class="path">{{ path }}</span>
        <button type="button" class="secondary" @click="emit('reveal')">
          <FolderOpen :size="16" aria-hidden="true" />
          Show in Folder
        </button>
      </div>
      <p v-if="failed" class="failure" role="alert">{{ openingFailures.folder }}</p>
    </template>
    <p v-else class="note">No data folder is available on this device.</p>
  </div>
</template>

<style scoped>
.data-folder {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.folder {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.path {
  flex: 1 1 260px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--panel-rim);
  border-radius: 10px;
  background: var(--list);
  color: var(--text-soft);
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  font-size: 13px;
  line-height: 1.4;
  overflow-wrap: anywhere;
  user-select: text;
}
.folder button {
  font-size: 14px;
}
.failure {
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  color: var(--error);
  background: var(--error-tint);
  font-size: 13px;
  line-height: 1.45;
}
.note {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.5;
}
</style>
