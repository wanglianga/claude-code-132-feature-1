<template>
  <div class="item-photo" :class="{ lg }">
    <img v-if="isImage" :src="photo" :alt="category" />
    <span v-else>{{ photo || CATEGORY_META[category].icon }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Category } from '../types'
import { CATEGORY_META } from '../meta'

const props = withDefaults(defineProps<{ photo?: string; category: Category; lg?: boolean }>(), {
  photo: '',
  lg: false,
})

const isImage = computed(() => props.photo.startsWith('data:') || props.photo.startsWith('http'))
</script>
