<script setup lang="ts">
import { ref, computed } from 'vue'
import { add, subtract, multiply } from '../utils/math'

const a = ref(0)
const b = ref(0)
const operation = ref<'add' | 'subtract' | 'multiply'>('add')

const result = computed(() => {
  switch (operation.value) {
    case 'add':
      return add(a.value, b.value)
    case 'subtract':
      return subtract(a.value, b.value)
    case 'multiply':
      return multiply(a.value, b.value)
    default:
      return 0
  }
})
</script>

<template>
  <div class="calculator">
    <h2>Calculator</h2>
    <input v-model.number="a" type="number" placeholder="First number">
    <select v-model="operation">
      <option value="add">+</option>
      <option value="subtract">-</option>
      <option value="multiply">*</option>
    </select>
    <input v-model.number="b" type="number" placeholder="Second number">
    <p>Result: {{ result }}</p>
  </div>
</template>

<style scoped>
.calculator {
  margin-top: 20px;
  padding: 10px;
  border: 1px solid #ccc;
}
</style>
