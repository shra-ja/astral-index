<script setup lang="ts">
// Presentational: what one history holds, for the restore confirmation: its roll and
// account totals, each account with its server and rolls, and its last import. Set
// beside another history, it marks the accounts that one lacks.
import type { DeepReadonly } from 'vue'
import type { HistoryContents } from '../../commands'
import { holdsAccount, plural, serverName } from '../../format'
import { lastImportParts } from '../../messages'

const props = defineProps<{
  id: string
  title: string
  tag: string
  /** What the panel says when the history holds nothing. */
  empty: string
  /** The history, or null when it can't be read. */
  contents: DeepReadonly<HistoryContents> | null
  /** What the panel says when the history can't be read. */
  unreadable?: string
  /** The history to compare with; accounts it lacks are marked. */
  compared?: DeepReadonly<HistoryContents>
  /** The history the restore makes current, drawn in the accent. */
  accent?: boolean
}>()

// The roll total of a history that could be read.
const total = (contents: DeepReadonly<HistoryContents>) =>
  contents.accounts.reduce((sum, account) => sum + account.rolls, 0).toLocaleString('en')
// Accounts are told apart by UID and server together.
const key = (account: { uid: string; server: string }) => `${account.uid}\n${account.server}`
const missing = (account: { uid: string; server: string }) =>
  props.compared !== undefined && !holdsAccount(props.compared, account)
</script>

<template>
  <section class="contents-panel" :class="{ accent }" :aria-labelledby="id">
    <div class="top">
      <h2 :id>{{ title }}</h2>
      <span class="tag">{{ tag }}</span>
    </div>
    <p v-if="!contents" class="empty">{{ unreadable }}</p>
    <p v-else-if="contents.accounts.length === 0" class="empty">{{ empty }}</p>
    <template v-else>
      <div class="figures">
        <div class="figure">
          <span class="label">Rolls</span>
          <span class="value">{{ total(contents) }}</span>
        </div>
        <div class="figure">
          <span class="label">Accounts</span>
          <span class="value">{{ contents.accounts.length.toLocaleString('en') }}</span>
        </div>
      </div>
      <ul :aria-label="`Accounts: ${title}`">
        <li v-for="account in contents.accounts" :key="key(account)">
          <span class="uid">UID {{ account.uid }}</span>
          <span class="chip">{{ serverName(account.server) }}</span>
          <span v-if="missing(account)" class="chip missing">Not in the backup</span>
          <span class="rolls">{{ plural(account.rolls, 'roll') }}</span>
        </li>
      </ul>
      <p v-if="contents.last_import" class="last">
        <span class="label">Last import</span>
        <template v-for="(part, index) in lastImportParts(contents.last_import)" :key="index">
          <span v-if="index > 0" aria-hidden="true">·</span>
          <span>{{ part }}</span>
        </template>
      </p>
    </template>
  </section>
</template>

<style scoped>
.contents-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 22px 24px;
  border: 1px solid var(--panel-rim);
  border-radius: 14px;
  background: var(--list);
}
.contents-panel.accent {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--panel));
  background: var(--panel);
}
.top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
}
h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.tag {
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--panel-rim);
  color: var(--text-soft);
  font-size: 12px;
  font-weight: 500;
}
.accent .tag {
  background: var(--accent-tint);
  color: var(--accent);
}
.empty {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.5;
}
.figures {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 32px;
}
.figure {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.label {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
}
.value {
  font-size: 24px;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  line-height: 28px;
}
ul {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--panel-rim);
  list-style: none;
}
li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  min-height: 40px;
  border-bottom: 1px solid var(--divider);
  font-size: 14px;
}
.uid {
  font-variant-numeric: tabular-nums;
}
.chip {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--panel-rim);
  color: var(--text-secondary);
  font-size: 12px;
}
.chip.missing {
  background: var(--caution-tint);
  color: var(--caution);
  font-weight: 500;
}
.rolls {
  margin-left: auto;
  color: var(--text-secondary);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.last {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.45;
  font-variant-numeric: tabular-nums;
}
.last .label {
  font-size: 13px;
}
</style>
