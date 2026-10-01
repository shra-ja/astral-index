<script setup lang="ts">
// Presentational: shows what saving would change and reports the user's choice.
// The caller makes the native calls and renders the panel only while reviewing.
import { computed, onMounted, useTemplateRef } from 'vue'
import type { Review } from '../commands'
import { plural, warps } from '../format'

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
// The review takes focus as it appears, so screen readers announce it.
const headingElement = useTemplateRef<HTMLElement>('heading')
onMounted(() => headingElement.value!.focus())
</script>

<template>
  <section class="review" aria-labelledby="review-heading">
    <h3 id="review-heading" ref="heading" tabindex="-1">{{ heading }}</h3>
    <p class="detail">
      UID {{ review.uid }} · {{ review.server }} · {{ review.earliest.slice(0, 10) }} to
      {{ review.latest.slice(0, 10) }} (server time)
    </p>
    <table>
      <thead>
        <tr>
          <th scope="col">Warp</th>
          <th scope="col">New</th>
          <th scope="col">Already saved</th>
          <th scope="col">Conflicts</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="category in review.categories" :key="category.gacha_type">
          <th scope="row">{{ warps[category.gacha_type] }}</th>
          <td>{{ category.inserted.toLocaleString('en') }}</td>
          <td>{{ category.duplicates.toLocaleString('en') }}</td>
          <td>{{ category.conflicts.toLocaleString('en') }}</td>
        </tr>
      </tbody>
    </table>
    <!-- The native commit refuses conflicts, so Save stays disabled and points here. -->
    <div class="conflicts" :hidden="!conflicting">
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
    <div class="actions">
      <button
        type="button"
        :hidden="nothingNew"
        :disabled="busy || conflicting"
        :aria-describedby="conflicting ? 'conflicts-note' : undefined"
        @click="emit('save')"
      >
        Save to this device
      </button>
      <button
        type="button"
        class="secondary"
        :hidden="nothingNew"
        :disabled="busy"
        @click="emit('discard')"
      >
        Discard
      </button>
      <button type="button" :hidden="!nothingNew" :disabled="busy" @click="emit('done')">
        Done
      </button>
    </div>
  </section>
</template>

<style scoped>
.review {
  margin: 0 auto;
  max-width: 620px;
  text-align: left;
}
h3 {
  font-size: 19px;
  font-weight: 550;
  margin: 0 0 6px;
}
h3:focus {
  outline: none;
}
h3:focus-visible {
  outline: 3px solid #d3c48e;
}
.detail {
  color: #adb7af;
  font-size: 13px;
  margin: 0 0 20px;
  overflow-wrap: anywhere;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
th,
td {
  padding: 9px 8px;
  border-bottom: 1px solid #37433d;
}
thead th {
  color: #adb7af;
  font-size: 12px;
  font-weight: 500;
}
th[scope='row'] {
  font-weight: 500;
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
.conflicts {
  margin-top: 20px;
  color: #e5c8a8;
  line-height: 1.5;
}
.conflicts ul {
  color: #c6cfc7;
  font-family: ui-monospace, monospace;
  font-size: 13px;
  padding-left: 20px;
  overflow-wrap: anywhere;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
}
@media (max-width: 600px) {
  th,
  td {
    padding: 8px 4px;
  }
}
</style>
