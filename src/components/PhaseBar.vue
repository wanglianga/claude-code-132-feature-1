<template>
  <div class="row between wrap card" style="padding: 12px 18px">
    <div class="phase-steps">
      <template v-for="(p, i) in phases" :key="p.key">
        <div class="phase-step" :class="{ done: i < currentIndex, now: i === currentIndex }">
          <span class="dot">{{ i < currentIndex ? '✓' : i + 1 }}</span>
          <span>{{ p.label }}</span>
        </div>
        <div v-if="i < phases.length - 1" class="phase-sep" />
      </template>
    </div>
    <div class="row">
      <span class="small muted">{{ PHASE_META[event.phase].desc }}</span>
      <button
        v-if="isStaff && nextPhase"
        class="btn sm primary"
        @click="advance"
      >
        推进到「{{ PHASE_META[nextPhase].label }}」
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useDataStore } from '../stores/data'
import { useAuthStore } from '../stores/auth'
import { PHASE_META } from '../meta'
import type { EventPhase } from '../types'

const data = useDataStore()
const auth = useAuthStore()
const event = computed(() => data.event)

const phases: { key: EventPhase; label: string }[] = [
  { key: 'signup', label: '报名审核' },
  { key: 'matching', label: '撮合配对' },
  { key: 'onsite', label: '现场活动' },
  { key: 'finished', label: '活动总结' },
]
const currentIndex = computed(() => phases.findIndex((p) => p.key === event.value.phase))
const nextPhase = computed(() => (currentIndex.value < phases.length - 1 ? phases[currentIndex.value + 1].key : null))
const isStaff = computed(() => auth.currentUser?.role === 'staff')

function advance() {
  if (!nextPhase.value || !auth.currentUser) return
  data.setPhase(nextPhase.value, auth.currentUser.name)
}
</script>
