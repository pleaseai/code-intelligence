<script setup lang="ts">
import { ref, computed } from 'vue'
import Calculator from './components/Calculator.vue'

const title = ref('Vue LSP Test App')
const count = ref(0)

const doubledCount = computed(() => count.value * 2)

function increment() {
  count.value++
}
</script>

<template>
  <div class="app">
    <h1>{{ title }}</h1>
    <p>Count: {{ count }}</p>
    <p>Doubled: {{ doubledCount }}</p>
    <button @click="increment">
      Increment
    </button>
    <Calculator />
  </div>
</template>

<style scoped>
.app {
  padding: 20px;
}
</style>
