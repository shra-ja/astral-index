<script setup lang="ts">
// Presentational: shows what saving would change and reports the user's choice.
// The caller makes the native calls and renders the panel only while reviewing.
import { computed, onMounted, useTemplateRef } from 'vue'
import type { Review } from '../commands'
import { plural, serverDate, warps } from '../format'

const props = defineProps<{ review: Review; busy: boolean }>()
const emit = defineEmits<{ save: []; discard: []; done: [] }>()

const conflicting = computed(() => props.review.summary.conflicts > 0)
// Save is offered only when something is new; Done replaces it otherwise.
const nothingNew = computed(() => props.review.summary.inserted === 0 && !conflicting.value)
const heading = computed(() => {
  if (conflicting.value) return 'Some rolls conflict with your saved history'
  if (nothingNew.value) return 'Everything here is already saved'
  return `Ready to save ${plural(props.review.summary.inserted, 'new roll')}`
})
const footnote = computed(() => {
  if (conflicting.value) return 'Nothing can be saved while rolls conflict.'
  if (nothingNew.value) return 'Nothing new to save. Your saved history already has these rolls.'
  return `Saving adds ${plural(props.review.summary.inserted, 'roll')}. Rolls already saved are never changed.`
})
const stats = computed(() => [
  ['New rolls', props.review.summary.inserted],
  ['Already saved', props.review.summary.duplicates],
  ['Conflicts', props.review.summary.conflicts],
])

// The review takes focus as it appears, so screen readers announce it.
const headingElement = useTemplateRef<HTMLElement>('heading')
onMounted(() => headingElement.value!.focus())
</script>

<template>
  <section class="review" aria-labelledby="review-heading">
    <div class="body">
      <h2 id="review-heading" ref="heading" tabindex="-1">{{ heading }}</h2>
      <p class="account">
        <span class="label">Account</span> <span>UID {{ review.uid }}</span>
        <span class="chip">{{ review.server }}</span>
      </p>

      <div class="stats">
        <div v-for="[label, value] in stats" :key="label" class="stat">
          <span class="stat-label">{{ label }}</span>
          <span class="stat-value">{{ value.toLocaleString('en') }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Retrieved period</span>
          <span class="stat-value period"
            ><span>{{ serverDate(review.earliest) }} – </span
            ><span>{{ serverDate(review.latest) }}</span></span
          >
        </div>
      </div>
      <p class="caption">Times are server time.</p>

      <div class="panel">
        <h3 id="review-categories">By Category</h3>
        <table aria-labelledby="review-categories">
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">New</th>
              <th scope="col">Already saved</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="category in review.categories" :key="category.gacha_type">
              <th scope="row">{{ warps[category.gacha_type] }}</th>
              <td :class="{ none: category.inserted === 0 }">
                {{ category.inserted.toLocaleString('en') }}
              </td>
              <td>{{ category.duplicates.toLocaleString('en') }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- The native commit refuses conflicts, so Save stays disabled and points here. -->
      <div v-if="conflicting" class="conflicts panel">
        <p id="conflicts-note">
          These retrieved rolls differ from saved rolls with the same ID, so nothing can be saved.
          Discarding them leaves this device unchanged.
        </p>
        <ul>
          <li v-for="conflict in review.conflicts" :key="conflict.id">
            {{ warps[conflict.gacha_type] }} · {{ conflict.time }} · ID {{ conflict.id }}
          </li>
        </ul>
      </div>
    </div>

    <footer class="actions">
      <span class="footnote">{{ footnote }}</span>
      <div class="buttons">
        <button v-if="nothingNew" type="button" :disabled="busy" @click="emit('done')">Done</button>
        <template v-else>
          <button type="button" class="secondary" :disabled="busy" @click="emit('discard')">
            Discard
          </button>
          <button
            type="button"
            :disabled="busy || conflicting"
            :aria-describedby="conflicting ? 'conflicts-note' : undefined"
            @click="emit('save')"
          >
            Save {{ plural(review.summary.inserted, 'roll') }}
          </button>
        </template>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.review {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  min-height: 0;
}
.body {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  gap: 16px;
  min-height: 0;
  padding: 20px var(--gutter);
  overflow-y: auto;
}
h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
h2:focus {
  outline: none;
}
h2:focus-visible {
  outline: 2px solid var(--accent);
}
.account {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  margin: 0;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
.account .label {
  color: var(--text-muted);
}
.chip {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--panel-rim);
  color: var(--text-secondary);
  font-size: 12px;
}
.stats {
  display: grid;
  flex-shrink: 0;
  grid-template-columns: repeat(3, minmax(0, 1fr)) minmax(max-content, 1.3fr);
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--panel-rim);
  border-radius: 12px;
  background: var(--panel-rim);
}
.stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  height: 78px;
  padding: 12px 20px;
  background: var(--panel);
}
.stat-label {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
}
.stat-value {
  font-size: 24px;
  font-weight: 500;
  line-height: 28px;
  font-variant-numeric: tabular-nums;
}
.stat:first-child .stat-value {
  color: var(--accent);
}
.stat-value.period {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  min-height: 28px;
  font-size: 16px;
  line-height: 18px;
}
.period span {
  white-space: pre;
}
.caption {
  margin: -8px 0 0;
  color: var(--text-muted);
  font-size: 12px;
}
.panel {
  overflow: hidden;
  border: 1px solid var(--panel-rim);
  border-radius: 12px;
  background: var(--list);
}
h3 {
  margin: 0;
  padding: 14px 18px;
  font-size: 14px;
  font-weight: 600;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
th,
td {
  height: 40px;
  padding: 0 18px;
  border-top: 1px solid var(--divider);
}
thead th {
  height: 32px;
  border-top: 0;
  background: var(--panel);
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
}
th[scope='row'] {
  color: var(--text-soft);
  font-weight: 400;
  text-align: left;
}
th[scope='col']:first-child {
  text-align: left;
}
th[scope='col'],
td {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
td {
  color: var(--accent);
}
td.none {
  color: var(--text-faint);
}
td + td {
  color: var(--text-muted);
}
.conflicts {
  padding: 16px 18px;
  color: #e5c8a8;
  line-height: 1.5;
}
.conflicts p {
  margin: 0;
}
.conflicts ul {
  color: var(--text-soft);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  padding-left: 20px;
  overflow-wrap: anywhere;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px 24px;
  min-height: 76px;
  padding: 14px var(--gutter);
  border-top: 1px solid var(--divider);
  background: #0d1014;
}
.footnote {
  color: var(--text-secondary);
  font-size: 14px;
}
.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
@container app (max-width: 760px) {
  .stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
