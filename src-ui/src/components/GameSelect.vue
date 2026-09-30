<script setup lang="ts">
// Presentational: picks the game, bound with v-model.
import { games, type Game } from '../format'

const game = defineModel<Game>({ required: true })
</script>

<template>
  <div>
    <label for="game">Your game</label>
    <select id="game" v-model="game">
      <option v-for="(name, id) in games" :key="id" :value="id">{{ name }}</option>
    </select>
  </div>
</template>

<style scoped>
select {
  font: inherit;
  color: inherit;
  background: #131a19;
  border: 1px solid #526257;
  border-radius: 7px;
  padding: 10px 36px 10px 12px;
}
</style>
