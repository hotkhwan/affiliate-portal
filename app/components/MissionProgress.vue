<script setup lang="ts">
import type { ProgressItem } from '../lib/mission-flow'

defineProps<{
  items: ProgressItem[]
  posted: boolean
}>()

defineEmits<{
  reset: []
}>()
</script>

<template>
  <aside class="progress-card" aria-label="ความคืบหน้าภารกิจ">
    <div class="progress-heading">
      <span>ก้าวของคุณ</span>
      <strong>{{ items.filter(item => item.complete).length }}/5</strong>
    </div>
    <ol>
      <li v-for="item in items" :key="item.label" :class="{ complete: item.complete, current: item.current }">
        <span class="status-dot" aria-hidden="true">{{ item.complete ? '✓' : '' }}</span>
        <span>{{ item.label }}</span>
      </li>
    </ol>
    <button v-if="posted" class="text-button" type="button" @click="$emit('reset')">
      เริ่มภารกิจถัดไป →
    </button>
  </aside>
</template>
