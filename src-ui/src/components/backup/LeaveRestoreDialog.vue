<script setup lang="ts">
// Presentational: asks whether to leave a restore's confirmation, which sets the
// checked backup aside. A modal over the screen, with Stay focused first; Leave asks
// to leave, and Stay or Esc to stay. The caller removes the dialog.
import { onMounted, useTemplateRef } from 'vue'

const emit = defineEmits<{ stay: []; leave: [] }>()
const dialog = useTemplateRef('dialog')
const stay = useTemplateRef('stay')

onMounted(() => {
  dialog.value!.showModal()
  stay.value!.focus()
})

// Each answer closes the dialog natively, ending its modality, then asks for it.
let leaving = false
function answer(leave: boolean) {
  leaving = leave
  dialog.value!.close()
}
</script>

<template>
  <dialog
    ref="dialog"
    class="leave-restore"
    aria-labelledby="leave-restore-title"
    @close="leaving ? emit('leave') : emit('stay')"
  >
    <h2 id="leave-restore-title">Leave Without Restoring?</h2>
    <p>
      The backup you chose is set aside, and your history stays as it is. You can choose it again at
      any time.
    </p>
    <div class="buttons">
      <button ref="stay" type="button" class="secondary" @click="answer(false)">Stay</button>
      <button type="button" @click="answer(true)">Leave</button>
    </div>
  </dialog>
</template>

<style scoped>
.leave-restore {
  width: calc(100% - 2 * var(--gutter));
  max-width: 440px;
  padding: 24px 28px;
  border: 1px solid var(--rim-strong);
  border-radius: 16px;
  color: var(--text);
  background: var(--panel);
  box-shadow: 0 24px 64px rgb(0 0 0 / 50%);
}
.leave-restore::backdrop {
  background: rgb(5 7 10 / 62%);
}
h2 {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 600;
}
p {
  margin: 0 0 24px;
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.5;
}
.buttons {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 12px;
}
</style>
