<script setup lang="ts">
// Presentational: the third-party notices, like Chrome's credits page. Every component
// by origin, each opening to its licence texts and source. A text is rendered only
// once its component is open, so the list stays light with hundreds of components.
import { ChevronRight } from '@lucide/vue'
import { computed, reactive, type DeepReadonly } from 'vue'
import type { NoticeComponent, Notices } from '../../notices'

const props = defineProps<{ notices: DeepReadonly<Notices> | null; missing: boolean }>()

const groups = [
  { kind: 'crate', title: 'Rust Crates' },
  { kind: 'npm', title: 'Frontend Packages' },
  { kind: 'font', title: 'Typeface' },
] as const
const shown = computed(() =>
  groups
    .map((group) => ({
      ...group,
      components: props.notices!.components.filter(({ kind }) => kind === group.kind),
    }))
    .filter(({ components }) => components.length > 0),
)
const keyOf = (component: DeepReadonly<NoticeComponent>) => `${component.name}@${component.version}`
const open = reactive(new Set<string>())
function toggle(component: DeepReadonly<NoticeComponent>, event: Event) {
  const key = keyOf(component)
  if ((event.target as HTMLDetailsElement).open) open.add(key)
  else open.delete(key)
}
</script>

<template>
  <div class="notices-list">
    <p v-if="missing" class="note">
      Each build generates the notices; this one has none. Run <code>npm run notices</code> to see
      them here.
    </p>
    <p v-else-if="!notices" class="note" role="status">Loading the notices…</p>
    <template v-else>
      <p class="note">Astral Index ships these components, each under its own licence.</p>
      <section v-for="group in shown" :key="group.kind" :aria-labelledby="`notices-${group.kind}`">
        <h3 :id="`notices-${group.kind}`">
          {{ group.title }} <span class="count">({{ group.components.length }})</span>
        </h3>
        <ul>
          <li v-for="component in group.components" :key="keyOf(component)">
            <details @toggle="toggle(component, $event)">
              <summary>
                <ChevronRight class="chevron" :size="14" aria-hidden="true" />
                <!-- Spaces between the parts, so they read apart as text. -->
                <span class="name">{{ component.name }}</span
                >{{ ' ' }} <span class="version">{{ component.version }}</span
                >{{ ' ' }}
                <span class="licence">{{
                  component.licences.map(({ id }) => id).join(' AND ')
                }}</span>
              </summary>
              <div v-if="open.has(keyOf(component))" class="detail">
                <p class="source">Source: {{ component.source }}</p>
                <p v-for="licence in component.licences" :key="licence.id" class="licence-text">
                  {{ notices.texts[licence.text] }}
                </p>
              </div>
            </details>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.notices-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.note {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.5;
}
section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.count {
  color: var(--text-muted);
  font-weight: 400;
}
ul {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--panel-rim);
  border-radius: 10px;
}
li + li {
  border-top: 1px solid var(--panel-rim);
}
summary {
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr) auto;
  align-items: center;
  gap: 2px 10px;
  min-height: 40px;
  padding: 6px 12px;
  font-size: 13px;
  list-style: none;
  cursor: pointer;
}
summary::-webkit-details-marker {
  display: none;
}
.chevron {
  color: var(--text-muted);
  transition: transform 0.15s;
}
details[open] .chevron {
  transform: rotate(90deg);
}
.name {
  overflow-wrap: anywhere;
}
.version {
  grid-column: 2;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.licence {
  grid-column: 3;
  grid-row: 1 / span 2;
  color: var(--text-secondary);
  text-align: right;
}
.detail {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 12px 12px 36px;
}
.source,
.licence-text {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}
.licence-text {
  white-space: pre-line;
}
</style>
