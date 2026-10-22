import { watch } from 'vue'
import { createRouter, createWebHashHistory, type RouteLocationNormalized } from 'vue-router'
import HistoryView from '../views/HistoryView.vue'
import BackupView from '../views/BackupView.vue'
import ImportView from '../views/ImportView.vue'
import UnavailableView from '../views/UnavailableView.vue'
import type { HistoryAvailability } from '../composables/useHistoryAvailability'
import { games } from '../features'
import { isGameScreen, type Game, type Screen } from '../format'

// Each game this build shows has its own History and Import screens; a hidden game's
// address is unknown (decision 0026). Backup & Restore covers every game, so its
// address names none (decision 0033).
const game = `:game(${games.join('|')})`

// Hash history needs no server fallback under Tauri's custom protocol, and no one
// sees the URL (decision 0011). The app opens on Star Rail's history, the game with
// an adapter; any other address returns there.
export const openingGame: Game = 'honkai-star-rail'
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: `/${openingGame}/history` },
    { path: `/${game}/history`, name: 'history', component: HistoryView, props: true },
    { path: `/${game}/import`, name: 'import', component: ImportView, props: true },
    { path: '/backup', name: 'backup', component: BackupView },
    { path: '/unavailable', name: 'unavailable', component: UnavailableView },
    { path: '/:unknown(.*)*', redirect: '/' },
  ],
})

// Whether a route shows one of the selected game's screens.
const showsGame = (route: RouteLocationNormalized) =>
  typeof route.name === 'string' && isGameScreen(route.name as Screen)

/**
 * Keep the game screens away while the history can't be used, showing the History
 * Unavailable screen instead, and that screen away once it can (feature 0037). The
 * status is asked once, before the first screen shows, so no game screen reads the
 * history first, and a game screen shown when a later command finds it so gives way
 * too. Install it before the router is, so it sees the first navigation.
 */
export function guardHistory(availability: HistoryAvailability) {
  let asked: Promise<void> | undefined
  router.beforeEach(async (to) => {
    asked ??= availability.check()
    await asked
    const unavailable = availability.unavailable.value !== null
    if (unavailable && showsGame(to)) return { name: 'unavailable' }
    if (!unavailable && to.name === 'unavailable') return '/'
    return true
  })
  watch(availability.unavailable, (now) => {
    if (now && showsGame(router.currentRoute.value)) void router.replace({ name: 'unavailable' })
  })
}

export default router
