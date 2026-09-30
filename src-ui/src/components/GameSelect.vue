<script setup lang="ts">
// Presentational: picks the game, bound with v-model.
import { games, type Game } from '../format';

const game = defineModel<Game>({ required: true });
</script>

<template>
  <div>
    <label for="game">Your game</label>
    <select id="game" v-model="game">
      <option v-for="(name, id) in games" :key="id" :value="id">{{ name }}</option>
    </select>
  </div>
</template>
