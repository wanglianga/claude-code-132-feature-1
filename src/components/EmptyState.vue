<template>
  <div class="empty">
    <div class="icon">{{ icon }}</div>
    <div>{{ text }}</div>
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{ icon?: string; text: string }>()
</script>
