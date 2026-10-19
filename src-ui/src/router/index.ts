import { createRouter, createWebHashHistory } from 'vue-router'
import HistoryView from '../views/HistoryView.vue'
import BackupView from '../views/BackupView.vue'
import ImportView from '../views/ImportView.vue'
import { games } from '../features'
import type { Game } from '../format'

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
    { path: '/:unknown(.*)*', redirect: '/' },
  ],
})

export default router
