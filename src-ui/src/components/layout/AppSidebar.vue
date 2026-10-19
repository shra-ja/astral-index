<script setup lang="ts">
// Presentational: the app's navigation. Game links keep the current game screen;
// screen links stay within the game. On an app-wide screen no game is current, game
// links open a game's history and screen links stay with the game shown last
// (decision 0033). The router does the rest. The About button asks for the About
// dialog. Below 1100px the sidebar collapses to icons, so every link and button
// carries its name as a label and in a tooltip.
import { DatabaseBackup, Download, Info, Lock, TextAlignStart } from '@lucide/vue'
import { RouterLink } from 'vue-router'
import AppTooltip from '../shared/AppTooltip.vue'
import AstralEmblem from '../shared/AstralEmblem.vue'
import wordmark from '../../assets/brand/astral-index-wordmark-small.svg'
import { computed } from 'vue'
import {
  games as names,
  monograms,
  terms,
  type AppScreen,
  type Game,
  type Screen,
} from '../../format'

// `game` is the game shown last; `games` lists the games this build shows, in order.
const props = defineProps<{ game: Game; screen: Screen | AppScreen; games: readonly Game[] }>()
const emit = defineEmits<{ about: [] }>()
// The game screen shown, if any.
const gameScreen = computed(() => (props.screen === 'backup' ? null : props.screen))
</script>

<template>
  <nav class="sidebar" aria-label="Main">
    <div class="brand">
      <AstralEmblem />
      <img class="wordmark" :src="wordmark" alt="Astral Index" />
    </div>

    <div class="group">
      <h2 id="sidebar-games" class="text">Game</h2>
      <ul aria-labelledby="sidebar-games">
        <li v-for="id in games" :key="id">
          <AppTooltip :text="names[id]" placement="right">
            <RouterLink
              class="link"
              :to="{ name: gameScreen ?? 'history', params: { game: id } }"
              :aria-label="names[id]"
              :aria-current="gameScreen && id === game ? 'true' : undefined"
            >
              <span class="monogram" :class="id" aria-hidden="true">{{ monograms[id] }}</span>
              <span class="text">{{ names[id] }}</span>
            </RouterLink>
          </AppTooltip>
        </li>
      </ul>
    </div>

    <div class="group">
      <h2 id="sidebar-screens" class="text">View</h2>
      <ul aria-labelledby="sidebar-screens">
        <li>
          <AppTooltip :text="`${terms[game]} History`" placement="right">
            <RouterLink
              class="link screen"
              :to="{ name: 'history', params: { game } }"
              :aria-label="`${terms[game]} History`"
              :aria-current="screen === 'history' ? 'page' : undefined"
            >
              <TextAlignStart :size="18" />
              <span class="text">{{ terms[game] }} History</span>
            </RouterLink>
          </AppTooltip>
        </li>
        <li>
          <AppTooltip text="Import" placement="right">
            <RouterLink
              class="link screen"
              :to="{ name: 'import', params: { game } }"
              aria-label="Import"
              :aria-current="screen === 'import' ? 'page' : undefined"
            >
              <Download :size="18" />
              <span class="text">Import</span>
            </RouterLink>
          </AppTooltip>
        </li>
      </ul>
    </div>

    <div class="group">
      <h2 id="sidebar-data" class="text">Data</h2>
      <ul aria-labelledby="sidebar-data">
        <li>
          <AppTooltip text="Backup &amp; Restore" placement="right">
            <RouterLink
              class="link screen"
              :to="{ name: 'backup' }"
              aria-label="Backup &amp; Restore"
              :aria-current="screen === 'backup' ? 'page' : undefined"
            >
              <DatabaseBackup :size="18" />
              <span class="text">Backup &amp; Restore</span>
            </RouterLink>
          </AppTooltip>
        </li>
      </ul>
    </div>

    <div class="foot">
      <AppTooltip text="About" placement="right">
        <button
          type="button"
          class="link about"
          aria-label="About"
          aria-haspopup="dialog"
          @click="emit('about')"
        >
          <Info :size="18" />
          <span class="text">About</span>
        </button>
      </AppTooltip>
      <div class="local">
        <Lock :size="16" :stroke-width="1.75" />
        <p class="text">
          <strong>Stored on this device</strong>
          <span>No account, no cloud sync</span>
        </p>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 28px;
  width: 232px;
  padding: 22px 14px 18px;
  background: var(--sidebar);
  border-right: 1px solid var(--divider);
  overflow-y: auto;
}
/* The brand's open lockup, sized from the wordmark's height H: the emblem without a
   tile, then a 0.4 H gap. The sidebar's padding keeps at least 0.7 H clear around it. */
.brand {
  --h: 18px;
  display: flex;
  align-items: center;
  gap: calc(var(--h) * 0.4);
  padding: 0 8px;
}
.wordmark {
  display: block;
  height: var(--h);
  width: auto;
}
.group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
h2 {
  margin: 0;
  padding: 0 10px 4px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
ul {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.link {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 10px;
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
}
.link:hover {
  color: var(--text);
}
.link[aria-current] {
  color: var(--text);
  background: var(--selected);
  border-color: var(--rim-strong);
}
.screen[aria-current] {
  border-color: transparent;
  color: var(--text);
}
.screen svg {
  color: var(--text-muted);
}
.screen[aria-current] svg {
  color: var(--accent);
}
.monogram {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
}
.monogram.genshin-impact {
  color: #b9e4c6;
  background: #22362d;
}
.monogram.honkai-star-rail {
  color: #cec6ff;
  background: #2a2846;
}
/* The About button and the device note sit together at the foot. */
.foot {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: auto;
}
.about {
  width: 100%;
  font-size: 14px;
  font-weight: 500;
  background: transparent;
}
.about svg {
  color: var(--text-muted);
}
.local {
  display: flex;
  gap: 10px;
  padding: 12px;
  border-radius: 10px;
  background: var(--sidebar-note);
  color: var(--text-muted);
}
.local svg {
  flex-shrink: 0;
  margin-top: 2px;
}
.local p {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
}
/* Names show in tooltips only once the labels are hidden. */
.sidebar :deep(.tooltip) {
  display: none;
}
.local strong {
  color: var(--text-soft);
  font-size: 13px;
  font-weight: 500;
}
/* Icons only when the app is narrow; each link keeps its label for assistive tech.
   The sidebar gives way before the content compacts: at this width the expanded
   sidebar would leave the summary strip too narrow for one row of four. */
@container app (max-width: 1100px) {
  .sidebar {
    width: 72px;
    padding-inline: 12px;
  }
  .sidebar .text {
    display: none;
  }
  /* The emblem alone, as large; the wordmark stays as the app's name for assistive tech. */
  .wordmark {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  .sidebar :deep(.tooltip) {
    display: block;
  }
  .brand,
  .link,
  .local {
    justify-content: center;
    padding-inline: 0;
  }
}
</style>
