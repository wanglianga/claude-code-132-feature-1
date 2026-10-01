<template>
  <div class="item-photo" :class="{ lg }">
    <img v-if="isImage" :src="photo" alt="物品照片" />
    <template v-else>{{ CATEGORY_META[category].icon }}</template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Category } from '../types'
import { CATEGORY_META } from '../meta'

const props = withDefaults(
  defineProps<{ photo?: string; category: Category; lg?: boolean }>(),
  { photo: '', lg: false },
)

const isImage = computed(() => /^(data:image\/|https?:\/\/|blob:)/.test(props.photo))
</script>
