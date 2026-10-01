<template>
  <div class="action-panel mt12">
    <!-- 第一步：现场复核（对照原始描述） -->
    <div class="card-title" style="font-size: 14px">① 现场复核（对照报名原始描述与照片）</div>
    <div class="row wrap">
      <textarea v-model.trim="reviewNote" class="textarea" style="flex: 1; min-width: 240px" placeholder="复核记录：实物与原始描述是否一致、缺件是否影响使用、消毒可否确认……" />
      <div class="row" style="flex-direction: column; gap: 8px">
        <button class="btn sm success" @click="doReview(true)">✅ 复核通过</button>
        <button class="btn sm danger" @click="doReview(false)">❌ 复核不通过</button>
      </div>
    </div>
    <p v-if="lastVerdict" class="small mt8">
      最近复核结论：
      <span :class="lastVerdict.passed ? 'green-text' : 'red-text'"><b>{{ lastVerdict.passed ? '通过' : '不通过' }}</b></span>
      · {{ lastVerdict.by }} · {{ fmtTime(lastVerdict.at) }}
      <template v-if="lastVerdict.note">· {{ lastVerdict.note }}</template>
    </p>

    <div class="divider" />

    <!-- 第二步：依据对方选择与到场情况执行回滚 -->
    <div class="card-title" style="font-size: 14px">② 依据复核结论、对方选择与实际到场情况执行处置</div>
    <div class="row wrap">
      <select v-model="action" class="select" style="flex: 1; min-width: 320px">
        <option value="">选择处置动作……</option>
        <option v-for="a in availableActions" :key="a.key" :value="a.key">{{ a.label }}{{ a.hint ? `（${a.hint}）` : '' }}</option>
      </select>
    </div>
    <div v-if="actionHint" class="notice info mt8">{{ actionHint }}</div>
    <div v-if="guardError" class="notice error mt8">{{ guardError }}</div>
    <div class="row mt8">
      <input v-model.trim="resolution" class="input" style="flex: 1" placeholder="处理结论说明（必填，将同步给双方家长与志愿者）" />
      <button class="btn primary" @click="apply">执行处置并办结</button>
    </div>
    <p class="hint mt8">
      规则：继续交换须复核通过且对方选择继续；取消时已到场方可保留时段改约并补偿摊位优先级，未到场则释放时段摊位；
      转捐须家长已授权且公益机构仍有接收能力；争议无法一致时转人工调解，冻结期间任何一方不得单独改写结果。
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDataStore, type ProblemAction } from '../stores/data'
import { useAuthStore } from '../stores/auth'
import { CHOICE_META } from '../meta'
import { fmtTime } from '../utils'
import type { Incident } from '../types'

const props = defineProps<{ inc: Incident }>()
const auth = useAuthStore()
const data = useDataStore()

const reviewNote = ref('')
const action = ref<ProblemAction | ''>('')
const resolution = ref('')
const guardError = ref('')

const item = computed(() => data.itemById(props.inc.itemId))
const match = computed(() => (props.inc.matchId ? data.matchById(props.inc.matchId) : undefined))
const other = computed(() => {
  if (!match.value || !item.value) return null
  return data.itemById(match.value.itemAId === item.value.id ? match.value.itemBId : match.value.itemAId)
})
const otherOnsite = computed(() => !!other.value?.checkIn?.passed)
const lastVerdict = computed(() => item.value?.problems?.[item.value.problems.length - 1]?.staffVerdict)
const decision = computed(() => match.value?.counterpartDecision)
const charity = computed(() => data.users.find((u) => u.role === 'charity'))

const ALL_ACTIONS: { key: ProblemAction; label: string; hint?: string }[] = [
  { key: 'continue', label: '✅ 复核通过，双方继续交换', hint: '需复核通过 + 对方选择继续' },
  { key: 'free_exchange', label: '🎪 解除组合，双方改为自由交换' },
  { key: 'wait', label: '⏳ 等待替代物品（保留摊位与时段）' },
  { key: 'cancel_arrived_keep', label: '✖️ 取消：对方已到场，保留时段改约 + 补偿摊位优先级' },
  { key: 'cancel_arrived_release', label: '✖️ 取消：对方已到场，释放时段转自由交换' },
  { key: 'cancel_absent', label: '✖️ 取消：双方未到场，释放时段与摊位' },
  { key: 'take_back', label: '🎒 复核不通过，问题物品带回（计入退回）' },
  { key: 'donate', label: '💚 社区决定转捐（校验授权与接收能力）' },
  { key: 'mediation', label: '🧑‍⚖️ 转人工调解（维持冻结，不改变结果）' },
]

const availableActions = computed(() =>
  ALL_ACTIONS.filter((a) => {
    if (a.key === 'cancel_arrived_keep' || a.key === 'cancel_arrived_release') return otherOnsite.value
    if (a.key === 'cancel_absent') return !otherOnsite.value
    // 复核不通过的问题物品不能回到自由交换区或继续交换
    if (lastVerdict.value && !lastVerdict.value.passed && (a.key === 'free_exchange' || a.key === 'continue')) return false
    return true
  }),
)

const actionHint = computed(() => {
  switch (action.value) {
    case 'continue':
      if (!lastVerdict.value?.passed) return '⚠️ 尚未复核通过，不能执行继续交换'
      if (decision.value?.kind !== 'continue') return `⚠️ 对方当前选择为「${decision.value ? CHOICE_META[decision.value.kind].label : '未选择'}」，需对方选择继续`
      return '满足继续交换条件，执行后双方恢复核销并完成原组合交换。'
    case 'donate':
      return item.value?.acceptDonation
        ? `家长已授权捐赠；${charity.value?.orgName} 剩余接收能力 ${charity.value?.capacity ?? 0} 件。`
        : '⚠️ 家长尚未授权捐赠，执行将被拦截，需家长在争议协调页补充授权。'
    case 'wait':
      return '保留摊位与入场时段，社区协调替代物品后再交换；对方物品进入等待状态。'
    case 'cancel_arrived_keep':
      return '对方已到场：保留其入场时段用于改约，摊位优先级 +1；问题方释放时段并带回。'
    case 'cancel_arrived_release':
      return '对方已到场但自愿释放时段：双方摊位释放，对方转入自由交换区。'
    case 'cancel_absent':
      return '双方均未到场：各自释放预约时段与摊位，对方物品回到待撮合池，避免重复占用。'
    default:
      return ''
  }
})

function doReview(passed: boolean) {
  data.reviewProblem(props.inc.id, passed, auth.currentUser!.name, reviewNote.value)
  reviewNote.value = ''
}

function apply() {
  guardError.value = ''
  if (!action.value) return alert('请选择处置动作')
  if (!resolution.value.trim()) return alert('请填写处理结论说明')
  const r = data.resolveProblem(props.inc.id, action.value, auth.currentUser!.name, resolution.value.trim())
  if (!r.ok) {
    guardError.value = r.error ?? '处置失败'
    return
  }
  action.value = ''
  resolution.value = ''
}
</script>

<style scoped>
.action-panel {
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 14px;
  background: #fcfaf7;
}
.green-text { color: var(--green); }
.red-text { color: var(--red); }
</style>
