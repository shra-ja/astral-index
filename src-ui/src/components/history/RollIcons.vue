<script setup lang="ts">
// Presentational: a page of saved rolls as icons, newest first, each with its pity in
// the corner, as many to a row as fit. The icons are one Tab stop: arrow keys move by
// icon and by row, Home and End jump to the ends, and each names its roll in a
// tooltip, so the names are there for the keyboard and the pointer alike.
import { ref, useTemplateRef, watch } from 'vue'
import type { SoftPity, StoredRoll } from '../../commands'
import { rollBand, serverDate } from '../../format'
import AppTooltip from '../shared/AppTooltip.vue'
import ItemIcon from './ItemIcon.vue'

const props = defineProps<{
  rolls: readonly StoredRoll[]
  caption: string
  /** The category's soft-pity thresholds, which colour 5★ pity; none leaves it plain. */
  softPity?: SoftPity | null
}>()

const label = (roll: StoredRoll) =>
  `${roll.name}, ${roll.rank_type}★, pity ${roll.pity}, #${roll.number}, ${serverDate(roll.time)}`
const bandClass = (roll: StoredRoll) => {
  const band = rollBand(roll, props.softPity)
  return band && `band-${band}`
}

// The icon that takes focus on Tab; a new page starts from its first.
const current = ref(0)
watch(
  () => props.rolls,
  () => (current.value = 0),
)
const tiles = useTemplateRef<HTMLElement[]>('tiles')

/** How many icons fit in a row, from where the browser placed them. */
function perRow(all: HTMLElement[]) {
  return all.filter((tile) => tile.offsetTop === all[0].offsetTop).length
}

/** The icon below, or the last one when the next row is too short to have one below. */
function below(index: number, row: number, last: number) {
  if (index + row <= last) return index + row
  return Math.floor(index / row) < Math.floor(last / row) ? last : index
}

function onKey(event: KeyboardEvent, index: number) {
  const all = tiles.value as HTMLElement[]
  const last = all.length - 1
  const row = perRow(all)
  const moves: Record<string, number> = {
    ArrowRight: Math.min(index + 1, last),
    ArrowLeft: Math.max(index - 1, 0),
    ArrowDown: below(index, row, last),
    ArrowUp: index - row >= 0 ? index - row : index,
    Home: 0,
    End: last,
  }
  if (!(event.key in moves)) return
  event.preventDefault()
  current.value = moves[event.key]
  all[current.value].focus()
}
</script>

<template>
  <ul class="roll-icons" :aria-label="caption">
    <li v-for="(roll, index) in rolls" :key="roll.id">
      <AppTooltip :text="label(roll)">
        <span
          ref="tiles"
          class="tile"
          role="img"
          :aria-label="label(roll)"
          :tabindex="index === current ? 0 : -1"
          @keydown="onKey($event, index)"
          @focus="current = index"
        >
          <ItemIcon :name="roll.name" :rarity="roll.rank_type" size="large" />
          <span class="pity" :class="bandClass(roll)" aria-hidden="true">{{ roll.pity }}</span>
        </span>
      </AppTooltip>
    </li>
  </ul>
</template>

<style scoped>
.roll-icons {
  display: grid;
  flex-grow: 1;
  grid-template-columns: repeat(auto-fill, 64px);
  align-content: start;
  gap: 10px;
  /* Sized by the panel, not its icons, with room for a few rows; the screen scrolls
     when even that does not fit. */
  contain: size;
  min-height: 200px;
  margin: 0;
  padding: 16px;
  overflow-y: auto;
  list-style: none;
}
.tile {
  position: relative;
  display: block;
  border-radius: 14px;
}
.pity {
  position: absolute;
  right: 3px;
  bottom: 3px;
  min-width: 22px;
  padding: 2px 5px;
  border-radius: 6px;
  background: rgb(11 13 17 / 88%);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
  line-height: 14px;
  text-align: center;
  font-variant-numeric: tabular-nums;
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
