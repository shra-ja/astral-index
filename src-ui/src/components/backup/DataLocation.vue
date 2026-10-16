<script setup lang="ts">
// Presentational: where history is stored, with a button that asks to show the file
// in its folder. The caller opens it and says whether that failed.
import { FolderOpen } from '@lucide/vue'
import { computed } from 'vue'
import { historyFile } from '../../format'
import { openingFailures } from '../../messages'

const props = defineProps<{ folder: string | null; failed: boolean }>()
const emit = defineEmits<{ reveal: [] }>()
const file = computed(() => (props.folder === null ? null : historyFile(props.folder)))
</script>

<template>
  <div class="location">
    <template v-if="file">
      <div class="where">
        <span class="label">History is stored in</span>
        <span class="path">{{ file }}</span>
        <button type="button" class="secondary" @click="emit('reveal')">
          <FolderOpen :size="16" :stroke-width="1.75" />
          Show in Folder
        </button>
      </div>
      <p v-if="failed" class="failure" role="alert">{{ openingFailures.folder }}</p>
    </template>
    <p v-else class="note">No data folder is available on this device.</p>
  </div>
</template>

<style scoped>
.location {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 20px;
  border: 1px solid var(--divider);
  border-radius: 12px;
}
.where {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
}
.label {
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 500;
}
.path {
  flex: 1 1 260px;
  min-width: 0;
  color: var(--text-soft);
  font-size: 14px;
  overflow-wrap: anywhere;
  user-select: text;
}
.where button {
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
