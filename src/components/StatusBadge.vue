<template>
  <span class="badge" :class="tone">{{ label }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { STATUS_META } from '../meta'
import type { ItemStatus } from '../types'

const props = defineProps<{ status: ItemStatus }>()
const label = computed(() => STATUS_META[props.status].label)
const tone = computed(() => STATUS_META[props.status].tone)
</script>
