<script setup lang="ts">
// Presentational: the app's navigation. Game links keep the current screen; screen
// links stay within the game. The router does the rest. Below 900px the sidebar
// collapses to icons, so every link carries its name as a label.
import { Download, Lock, TextAlignStart } from '@lucide/vue'
import { RouterLink } from 'vue-router'
import { games, monograms, terms, type Game, type Screen } from '../../format'

defineProps<{ game: Game; screen: Screen }>()
const gameIds = Object.keys(games) as Game[]
</script>

<template>
  <nav class="sidebar" aria-label="Main">
    <div class="brand">
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
        <rect x="1" y="1" width="24" height="24" rx="7" stroke="currentColor" stroke-width="1.6" />
        <path
          d="M8 17V9h5.2a2.6 2.6 0 0 1 0 5.2H8m5 0 3.6 2.8"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <span class="text">Roll Tracker</span>
    </div>

    <div class="group">
      <h2 id="sidebar-games" class="text">Game</h2>
      <ul aria-labelledby="sidebar-games">
        <li v-for="id in gameIds" :key="id">
          <RouterLink
            class="link"
            :to="{ name: screen, params: { game: id } }"
            :aria-label="games[id]"
            :aria-current="id === game ? 'true' : undefined"
          >
            <span class="monogram" :class="id" aria-hidden="true">{{ monograms[id] }}</span>
            <span class="text">{{ games[id] }}</span>
          </RouterLink>
        </li>
      </ul>
    </div>

    <div class="group">
      <h2 id="sidebar-screens" class="text">View</h2>
      <ul aria-labelledby="sidebar-screens">
        <li>
          <RouterLink
            class="link screen"
            :to="{ name: 'history', params: { game } }"
            :aria-label="`${terms[game]} History`"
            :aria-current="screen === 'history' ? 'page' : undefined"
          >
            <TextAlignStart :size="18" />
            <span class="text">{{ terms[game] }} History</span>
          </RouterLink>
        </li>
        <li>
          <RouterLink
            class="link screen"
            :to="{ name: 'import', params: { game } }"
            aria-label="Import"
            :aria-current="screen === 'import' ? 'page' : undefined"
          >
            <Download :size="18" />
            <span class="text">Import</span>
          </RouterLink>
        </li>
      </ul>
    </div>

    <div class="local">
      <Lock :size="16" :stroke-width="1.75" />
      <p class="text">
        <strong>Stored on this device</strong>
        <span>No account, no cloud sync</span>
      </p>
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
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 8px;
  color: var(--accent);
}
.brand .text {
  color: var(--text);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
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
.local {
  display: flex;
  gap: 10px;
  margin-top: auto;
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
.local strong {
  color: var(--text-soft);
  font-size: 13px;
  font-weight: 500;
}
/* Icons only when the app is narrow; each link keeps its label for assistive tech. */
@container app (max-width: 900px) {
  .sidebar {
    width: 72px;
    padding-inline: 12px;
  }
  .sidebar .text {
    display: none;
  }
  .brand,
  .link,
  .local {
    justify-content: center;
    padding-inline: 0;
  }
}
</style>
