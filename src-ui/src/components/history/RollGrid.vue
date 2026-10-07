<script setup lang="ts">
// Presentational: a page of saved rolls as tiles, newest first, as many to a row as
// fit (at least 190px each). Each shows the item's icon, name, type and roll number,
// rarity, its 5★ pity count coloured like the list's, and the date in server time.
import type { SoftPity, StoredRoll } from '../../commands'
import { rollBand, serverDate } from '../../format'
import ItemIcon from './ItemIcon.vue'
import RarityBadge from './RarityBadge.vue'

const props = defineProps<{
  rolls: readonly StoredRoll[]
  caption: string
  /** The category's soft-pity thresholds, which colour 5★ pity; none leaves it plain. */
  softPity?: SoftPity | null
}>()

const bandClass = (roll: StoredRoll) => {
  const band = rollBand(roll, props.softPity)
  return band && `band-${band}`
}
</script>

<template>
  <ul class="roll-grid" :aria-label="caption">
    <li v-for="roll in rolls" :key="roll.id" class="tile" :class="`rarity-${roll.rank_type}`">
      <div class="item">
        <ItemIcon :name="roll.name" :rarity="roll.rank_type" size="tile" />
        <div class="text">
          <span class="name">{{ roll.name }}</span>
          <span class="detail">{{ roll.item_type }} · #{{ roll.number }}</span>
        </div>
      </div>
      <div class="facts">
        <RarityBadge :rarity="roll.rank_type" />
        <span class="pity" :class="bandClass(roll)">Pity {{ roll.pity }}</span>
        <span class="date">{{ serverDate(roll.time) }}</span>
      </div>
    </li>
  </ul>
</template>

<style scoped>
.roll-grid {
  display: grid;
  flex-grow: 1;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  align-content: start;
  gap: 12px;
  min-height: 0;
  margin: 0;
  padding: 16px;
  overflow-y: auto;
  list-style: none;
}
.tile {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--panel-rim);
  border-radius: 10px;
  background: var(--panel);
}
.item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.name {
  overflow: hidden;
  color: var(--text-soft);
  white-space: nowrap;
  text-overflow: ellipsis;
}
.detail,
.date {
  color: var(--text-muted);
  font-size: 12px;
}
.facts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
}
.date {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}
.pity {
  color: var(--text-secondary);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
/* 5★ tiles and pity stand out, as in the list (decision 0020). */
.rarity-5 {
  border-color: #4a3b1e;
  background: color-mix(in srgb, var(--rarity-five) 6%, var(--panel));
}
.rarity-5 .name {
  color: var(--rarity-five);
  font-weight: 600;
}
.rarity-4 .name {
  color: var(--rarity-four);
  font-weight: 500;
}
.rarity-5 .pity {
  color: var(--text);
  font-weight: 600;
}
.pity.band-early {
  color: var(--pity-early);
}
.pity.band-near {
  color: var(--pity-near);
}
.pity.band-soft {
  color: var(--pity-soft);
}
</style>
