import { createRouter, createWebHashHistory } from 'vue-router'
import HistoryView from '../views/HistoryView.vue'
import BackupView from '../views/BackupView.vue'
import ImportView from '../views/ImportView.vue'
import { games } from '../features'

// Each game this build shows has its own History and Import screens; a hidden game's
// address is unknown (decision 0026). Backup & Restore covers every game, but sits
// under the current one, so switching games keeps the screen.
const game = `:game(${games.join('|')})`

// Hash history needs no server fallback under Tauri's custom protocol, and no one
// sees the URL (decision 0011). The app opens on Star Rail's history, the game with
// an adapter; any other address returns there.
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/honkai-star-rail/history' },
    { path: `/${game}/history`, name: 'history', component: HistoryView, props: true },
    { path: `/${game}/import`, name: 'import', component: ImportView, props: true },
    { path: `/${game}/backup`, name: 'backup', component: BackupView },
    { path: '/:unknown(.*)*', redirect: '/' },
  ],
})

export default router
