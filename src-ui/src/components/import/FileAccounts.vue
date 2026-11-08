<script setup lang="ts">
// Presentational: a history file's Star Rail accounts, the importable ones to choose
// one from for review, and why the others can't be imported, with what the file left
// out. Reports the account chosen, or Cancel; the caller previews it. The heading takes
// focus as it appears, so the choice is announced.
import { computed, onMounted, ref, useTemplateRef } from 'vue'
import type { FileAccount, FileContents } from '../../commands'
import { plural, serverName } from '../../format'
import { accountProblem, leftOut } from '../../messages'

// `busy` is set while the chosen account is previewed or the file is left.
const props = defineProps<{ name: string; contents: FileContents; busy: boolean }>()
const emit = defineEmits<{ review: [uid: string]; cancel: [] }>()

type Importable = Extract<FileAccount, { kind: 'importable' }>
const importable = computed(() =>
  props.contents.accounts.filter((account): account is Importable => account.kind === 'importable'),
)
const blocked = computed(() =>
  props.contents.accounts.flatMap((account) =>
    account.kind === 'importable' ? [] : [{ uid: account.uid, reason: accountProblem(account) }],
  ),
)
const notes = computed(() => leftOut(props.contents))
const intro = computed(() => {
  const count = props.contents.accounts.length
  const holds = `${props.name} holds ${plural(count, 'Star Rail account')}.`
  if (importable.value.length === 0)
    return `${holds} ${count === 1 ? 'It can’t be imported.' : 'None of them can be imported.'}`
  if (count === 1) return `${holds} Review it to see what saving would add.`
  return `${holds} Choose one to review; to import another afterwards, choose the file again.`
})

const chosen = ref(importable.value[0]?.uid)
function review() {
  if (!props.busy && chosen.value) emit('review', chosen.value)
}

const heading = useTemplateRef('heading')
onMounted(() => heading.value!.focus())
</script>

<template>
  <form class="accounts" aria-labelledby="accounts-heading" @submit.prevent="review">
    <div class="body">
      <div class="intro">
        <h2 id="accounts-heading" ref="heading" tabindex="-1">Choose an Account</h2>
        <p>{{ intro }}</p>
      </div>

      <fieldset v-if="importable.length > 0">
        <legend>Can be imported</legend>
        <label v-for="account in importable" :key="account.uid" class="choice">
          <input v-model="chosen" type="radio" name="file-account" :value="account.uid" />
          <!-- Spaced, so the radio's name reads as words. -->
          <span class="uid">UID {{ account.uid }}</span>
          {{ ' ' }}
          <span class="chip">{{ serverName(account.server) }}</span>
          {{ ' ' }}
          <span class="rolls">{{ plural(account.rolls, 'roll') }}</span>
        </label>
      </fieldset>

      <section v-if="blocked.length > 0" class="blocked" aria-labelledby="blocked-heading">
        <h3 id="blocked-heading">Can’t be imported</h3>
        <ul>
          <li v-for="account in blocked" :key="account.uid">
            <span class="uid">UID {{ account.uid }}</span>
            <span class="reason">{{ account.reason }}</span>
          </li>
        </ul>
      </section>

      <ul v-if="notes.length > 0" class="left-out">
        <li v-for="note in notes" :key="note">{{ note }}</li>
      </ul>
    </div>

    <footer class="actions">
      <span class="footnote">The review shows what saving would add. Nothing is saved yet.</span>
      <div class="buttons">
        <button type="button" class="secondary" :disabled="busy" @click="emit('cancel')">
          Cancel
        </button>
        <button type="submit" :disabled="busy || importable.length === 0">Review account</button>
      </div>
    </footer>
  </form>
</template>

<style scoped>
.accounts {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  min-height: 0;
}
.body {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  gap: 24px;
  min-height: 0;
  padding: clamp(24px, 4vh, 40px) var(--content-pad);
  overflow-y: auto;
}
.body > * {
  flex-shrink: 0;
  max-width: 760px;
}
.intro {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.intro p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
fieldset {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  border: 0;
}
legend,
h3 {
  margin: 0 0 10px;
  padding: 0;
  color: var(--text-soft);
  font-size: 13px;
  font-weight: 600;
}
/* Each account is a card around its radio, which stays real for keyboards. */
.choice {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  min-height: 56px;
  padding: 12px 18px;
  border: 1px solid var(--rim);
  border-radius: 12px;
  background: var(--panel);
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.choice:has(input:checked) {
  border-color: var(--accent);
  background: var(--accent-tint);
}
.choice:has(input:focus-visible) {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.choice input {
  width: 18px;
  height: 18px;
  margin: 0;
  accent-color: var(--accent);
}
.choice input:focus-visible {
  outline: none;
}
.choice .uid {
  font-size: 15px;
  font-weight: 500;
}
.chip {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--panel-rim);
  color: var(--text-secondary);
  font-size: 12px;
}
.rolls {
  margin-left: auto;
  color: var(--text-secondary);
  font-size: 14px;
}
.blocked ul {
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--panel-rim);
  border-radius: 12px;
  background: var(--list);
  list-style: none;
}
.blocked li {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 18px;
}
.blocked li + li {
  border-top: 1px solid var(--divider);
}
.blocked .uid {
  color: var(--text-soft);
  font-size: 14px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.reason {
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.45;
}
.left-out {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.45;
  list-style: none;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px 24px;
  min-height: 76px;
  padding: 14px var(--content-pad);
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
</style>
