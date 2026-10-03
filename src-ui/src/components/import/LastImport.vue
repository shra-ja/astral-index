<script setup lang="ts">
// Presentational: when the last import was saved, where it came from, which account
// it went into and how many rolls it added, as one wrapping line.
import type { LastImport } from '../../commands'
import { lastImportParts } from '../../messages'

defineProps<{ last: LastImport }>()
</script>

<template>
  <section class="last-import" aria-labelledby="last-import-label">
    <span id="last-import-label" class="label">Last import</span>
    <template v-for="(part, index) in lastImportParts(last)" :key="index">
      <span v-if="index > 0" class="separator" aria-hidden="true">·</span>
      <span class="part">{{ part }}</span>
    </template>
  </section>
</template>

<style scoped>
.last-import {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 14px;
  padding: 16px 20px;
  border: 1px solid var(--divider);
  border-radius: 12px;
}
.label {
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 500;
}
.part {
  color: var(--text-soft);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
.separator {
  color: var(--rim-strong);
}
</style>
