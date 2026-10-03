<script setup lang="ts">
// Presentational: a page of saved rolls, newest first. Columns keep stable widths
// except Item, which takes the spare space; as the list narrows, Type and then Time
// drop out. Rows scroll under a fixed header.
import type { StoredRoll } from '../../commands'
import { initials, serverDateTime } from '../../format'

defineProps<{ rolls: readonly StoredRoll[]; offset: string; caption: string }>()
</script>

<template>
  <div class="roll-list">
    <div class="table" role="table" :aria-label="caption">
      <div class="head" role="rowgroup">
        <div class="row" role="row">
          <span role="columnheader">#</span>
          <span role="columnheader">Item</span>
          <span role="columnheader">Rarity</span>
          <span role="columnheader" class="type">Type</span>
          <span role="columnheader" class="time" aria-sort="descending">Time ({{ offset }})</span>
        </div>
      </div>
      <div class="body" role="rowgroup">
        <div
          v-for="roll in rolls"
          :key="roll.id"
          class="row"
          :class="`rarity-${roll.rank_type}`"
          role="row"
        >
          <span role="cell" class="number">{{ roll.number }}</span>
          <span role="cell" class="item">
            <span class="icon" aria-hidden="true">{{ initials(roll.name) }}</span>
            <span class="name">{{ roll.name }}</span>
          </span>
          <span role="cell"
            ><span class="badge">{{ roll.rank_type }}★</span></span
          >
          <span role="cell" class="type">{{ roll.item_type }}</span>
          <span role="cell" class="time">{{ serverDateTime(roll.time) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.roll-list {
  container: rolls / inline-size;
  display: flex;
  flex-grow: 1;
  min-height: 0;
}
.table {
  --columns: 56px minmax(120px, 1fr) 64px minmax(84px, 140px) minmax(150px, 190px);

  display: flex;
  flex-direction: column;
  flex-grow: 1;
  min-width: 0;
  font-size: 14px;
}
@container rolls (max-width: 600px) {
  .table {
    --columns: 56px minmax(120px, 1fr) 64px minmax(150px, 190px);
  }
  .type {
    display: none;
  }
}
@container rolls (max-width: 440px) {
  .table {
    --columns: 56px minmax(120px, 1fr) 64px;
  }
  .time {
    display: none;
  }
}
.row {
  display: grid;
  grid-template-columns: var(--columns);
  align-items: center;
  padding: 0 20px;
}
.row > * {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.head {
  flex-shrink: 0;
}
.head .row {
  min-height: 36px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
}
.body {
  flex-grow: 1;
  min-height: 0;
  overflow-y: auto;
}
.body .row {
  min-height: 42px;
  border-top: 1px solid var(--divider);
}
.time {
  text-align: right;
}
.number,
.time {
  font-variant-numeric: tabular-nums;
}
.number {
  color: var(--text-muted);
  font-size: 13px;
}
.body .type,
.body .time {
  color: var(--text-secondary);
}
.body .time {
  font-size: 13px;
}
.item {
  display: flex;
  align-items: center;
  gap: 12px;
}
.name {
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-soft);
}
.icon {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--rarity-ring);
  border-radius: 8px;
  background: var(--rarity-icon);
  color: var(--rarity);
  font-size: 11px;
  font-weight: 700;
}
.badge {
  display: inline-block;
  min-width: 24px;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--rarity) 16%, transparent);
  color: var(--rarity);
  font-size: 12px;
  font-weight: 600;
  text-align: center;
}
.rarity-5 {
  --rarity: var(--rarity-five);
  --rarity-icon: #3a2c14;
  --rarity-ring: #6b5124;

  background: color-mix(in srgb, var(--rarity-five) 6%, transparent);
}
.rarity-4 {
  --rarity: var(--rarity-four);
  --rarity-icon: #2a2346;
  --rarity-ring: #463a72;
}
.rarity-3 {
  --rarity: var(--rarity-three);
  --rarity-icon: #1c2834;
  --rarity-ring: #2a3a4a;
}
.rarity-5 .name {
  color: var(--rarity-five);
  font-weight: 600;
}
.rarity-4 .name {
  color: var(--rarity-four);
  font-weight: 500;
}
</style>
