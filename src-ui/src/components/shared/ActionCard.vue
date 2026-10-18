<script setup lang="ts">
// Presentational: a card offering one action, as on the Import and Backup & Restore
// screens: an icon, a heading naming the section, a description and its points. The
// default slot adds controls below the points; the actions slot holds the buttons, at
// the card's foot, and the status slot what they report, which a status region below
// them announces.
defineProps<{ id: string; title: string; text: string; points: string[]; accent?: boolean }>()
</script>

<template>
  <section class="action-card" :aria-labelledby="id">
    <div class="icon" :class="{ accent }" aria-hidden="true">
      <slot name="icon" />
    </div>
    <h3 :id>{{ title }}</h3>
    <p>{{ text }}</p>
    <ul>
      <li v-for="point in points" :key="point">{{ point }}</li>
    </ul>
    <slot />
    <div class="actions">
      <slot name="actions" />
      <div v-if="$slots.status" class="status" role="status">
        <slot name="status" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.action-card {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 28px;
  border: 1px solid var(--rim);
  border-radius: 14px;
  background: var(--panel);
}
.icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--panel-rim);
  color: var(--text-soft);
}
.icon.accent {
  background: var(--accent-tint);
  color: var(--accent);
}
h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.5;
}
ul {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding-left: 20px;
  color: var(--text-soft);
  font-size: 14px;
  line-height: 1.45;
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: auto;
}
.actions > :slotted(button) {
  align-self: flex-start;
}
.status {
  min-height: 20px;
}
</style>
