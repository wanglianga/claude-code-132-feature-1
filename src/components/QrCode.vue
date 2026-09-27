<template>
  <div class="qr-box">
    <div class="qr-grid" :style="{ gridTemplateColumns: `repeat(${size}, 1fr)` }">
      <div
        v-for="(cell, i) in cells"
        :key="i"
        class="qr-cell"
        :class="{ on: cell }"
      />
    </div>
    <div class="small muted" style="text-align: center; margin-top: 8px; font-weight: 700; letter-spacing: 1px">
      {{ code }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ code: string }>()
const size = 21

/** 由核销码确定性生成伪 QR 图案（含三个定位角），用于演示扫码核销 */
const cells = computed(() => {
  const grid: boolean[] = new Array(size * size).fill(false)
  let seed = 0
  for (const ch of props.code) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0
  const rand = () => {
    seed = (seed * 1103515245 + 12345) >>> 0
    return seed / 0xffffffff
  }
  const finder = (ox: number, oy: number) => {
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        const edge = x === 0 || x === 6 || y === 0 || y === 6
        const core = x >= 2 && x <= 4 && y >= 2 && y <= 4
        grid[(oy + y) * size + (ox + x)] = edge || core
      }
    }
  }
  for (let i = 0; i < size * size; i++) grid[i] = rand() > 0.52
  finder(0, 0)
  finder(size - 7, 0)
  finder(0, size - 7)
  return grid
})
</script>
