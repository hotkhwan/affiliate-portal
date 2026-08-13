<script setup lang="ts">
import type { ProgressItem } from '../lib/mission-flow'

withDefaults(defineProps<{
  items: ProgressItem[]
  posted: boolean
  heading?: string
  ariaLabel?: string
  resetLabel?: string
}>(), {
  heading: 'ก้าวของคุณ',
  ariaLabel: 'ความคืบหน้าภารกิจ',
  resetLabel: 'เริ่มภารกิจถัดไป →',
})

defineEmits<{
  reset: []
}>()
</script>

<template>
  <aside class="progress-card" :aria-label="ariaLabel">
    <div class="progress-heading">
      <span>{{ heading }}</span>
      <strong>{{ items.filter(item => item.complete).length }}/{{ items.length }}</strong>
    </div>
    <ol>
      <li v-for="item in items" :key="item.label" :class="{ complete: item.complete, current: item.current }">
        <span class="status-dot" aria-hidden="true">{{ item.complete ? '✓' : '' }}</span>
        <span>{{ item.label }}</span>
      </li>
    </ol>
    <button v-if="items[0]?.complete" class="text-button" type="button" @click="$emit('reset')">
      {{ resetLabel }}
    </button>
  </aside>
</template>
