<script setup lang="ts">
// Presentational: the summary strip for the whole category shown, not just the
// page: rolls stored, 5★ and 4★ counts with their rates, and the stored period.
// Filters and search never change it (decision 0013).
import { computed } from 'vue'
import type { CategorySummary } from '../../commands'
import { rate, storedPeriod } from '../../format'

const props = defineProps<{ total: number; summary: CategorySummary }>()

const period = computed(() => storedPeriod(props.summary.first, props.summary.last))
</script>

<template>
  <section class="strip" aria-label="Category summary">
    <div class="tile">
      <span class="label">Rolls stored</span>
      <span class="value">{{ total.toLocaleString('en') }}</span>
    </div>
    <div class="tile">
      <span class="label">5★ rolls</span>
      <span class="line">
        <span class="value five">{{ summary.five_star.toLocaleString('en') }}</span>
        <span v-if="rate(summary.five_star, total)" class="rate">
          {{ rate(summary.five_star, total) }}
        </span>
      </span>
    </div>
    <div class="tile">
      <span class="label">4★ rolls</span>
      <span class="line">
        <span class="value four">{{ summary.four_star.toLocaleString('en') }}</span>
        <span v-if="rate(summary.four_star, total)" class="rate">
          {{ rate(summary.four_star, total) }}
        </span>
      </span>
    </div>
    <div class="tile">
      <span class="label">Stored period</span>
      <span class="value period">
        <template v-for="(part, index) in period" :key="part">
          <span>{{ part }}</span
          >{{ index < period.length - 1 ? ' ' : '' }}
        </template>
      </span>
    </div>
  </section>
</template>

<style scoped>
/* One row of four, or two by two when the content area is 760px or narrower, never
   three and one. The period column is never narrower than its full range. */
.strip {
  display: grid;
  flex-shrink: 0;
  grid-template-columns: repeat(3, minmax(0, 1fr)) minmax(max-content, 1.3fr);
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--panel-rim);
  border-radius: 12px;
  background: var(--panel-rim);
}
@container content (max-width: 760px) {
  .strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.tile {
  display: flex;
  flex-direction: column;
  gap: 2px;
  height: 78px;
  padding: 12px 20px;
  background: var(--panel);
}
.label {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
}
.line {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.value {
  font-size: 22px;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  line-height: 28px;
}
.five {
  color: var(--rarity-five);
}
.four {
  color: var(--rarity-four);
}
.rate {
  color: var(--text-muted);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.period {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: 0.3em;
  min-height: 28px;
  font-size: 16px;
  line-height: 18px;
}
.period > span {
  white-space: nowrap;
}
</style>
