<template>
  <ul class="timeline">
    <li v-for="(entry, i) in reversed" :key="i">
      <div class="t-action">{{ entry.action }}</div>
      <div class="t-meta">{{ entry.actor }} · {{ fmtTime(entry.at) }}</div>
      <div v-if="entry.detail" class="t-detail">{{ entry.detail }}</div>
    </li>
  </ul>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { HistoryEntry } from '../types'
import { fmtTime } from '../utils'

const props = defineProps<{ history: HistoryEntry[] }>()
const reversed = computed(() => [...props.history].reverse())
</script>
