<template>
  <div class="choice-panel mt12">
    <div class="card-title" style="font-size: 14px; margin: 0">🤝 对方物品被冻结，请选择您的处置方式</div>
    <p class="small muted">
      您的选择将提交社区，社区结合现场复核与双方到场情况执行；继续交换需社区复核通过，任何一方不能单方面改写交换结果。
    </p>
    <div v-if="match.counterpartDecision" class="notice info">
      您已选择「{{ CHOICE_META[match.counterpartDecision.kind].label }}」，等待社区确认执行；如情况变化可重新选择。
    </div>
    <div class="choice-grid mt8">
      <button
        v-for="c in choices"
        :key="c"
        type="button"
        class="choice-btn"
        :class="{ on: match.counterpartDecision?.kind === c }"
        @click="$emit('choose', match, c)"
      >
        <span class="choice-ico">{{ CHOICE_META[c].icon }}</span>
        <b>{{ CHOICE_META[c].label }}</b>
        <span class="small muted">{{ CHOICE_META[c].desc }}</span>
      </button>
    </div>
    <div class="tag-list mt8">
      <span class="tag">我的到场状态：{{ onsite ? '已到场核销' : '未到场' }}</span>
      <span class="tag">摊位 {{ match.booth }} · 时段 {{ match.entryTime }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { CHOICE_META } from '../meta'
import { useDataStore } from '../stores/data'
import type { CounterpartChoiceKind, Match } from '../types'

const props = defineProps<{ match: Match; myItemId: string }>()
defineEmits<{ choose: [match: Match, kind: CounterpartChoiceKind] }>()

const data = useDataStore()
const choices: CounterpartChoiceKind[] = ['continue', 'free_exchange', 'wait', 'cancel']

const onsite = computed(() => !!data.itemById(props.myItemId)?.checkIn?.passed)
</script>

<style scoped>
.choice-panel {
  border: 1px solid var(--indigo, #4f46e5);
  border-radius: 12px;
  padding: 14px;
  background: #f7f7ff;
}
.choice-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
.choice-btn {
  text-align: left;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 10px 12px;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 4px;
  cursor: pointer;
}
.choice-btn.on { border-color: var(--indigo, #4f46e5); background: #eef0ff; }
.choice-ico { font-size: 20px; }
</style>
