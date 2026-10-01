<template>
  <AppShell>
    <h2 class="page-title">异常处置台</h2>
    <p class="page-desc">围绕同一件物品，社区、志愿者、家长与公益机构协同处理缺席、不符、反悔、争议与接收不足；实物冻结须现场复核后回滚，任何一方不能单方面改写交换结果</p>

    <div class="chip-row mb16">
      <button v-for="t in tabs" :key="t.key" class="chip" :class="{ on: tab === t.key }" @click="tab = t.key">
        {{ t.label }}（{{ countOf(t.key) }}）
      </button>
    </div>

    <template v-if="filtered.length">
      <div v-for="inc in filtered" :key="inc.id" class="card">
        <div class="row between wrap">
          <div class="card-title" style="margin: 0">{{ INCIDENT_META[inc.type].icon }} {{ inc.title }}</div>
          <span class="badge" :class="statusTone(inc.status)">{{ statusLabel(inc.status) }}</span>
        </div>
        <div class="row wrap mt8" style="gap: 6px">
          <span class="tag">类型：{{ INCIDENT_META[inc.type].label }}</span>
          <span class="tag">物品：{{ itemOf(inc)?.name }}（{{ itemOf(inc)?.code }}）</span>
          <span class="tag">家长：{{ ownerOf(inc)?.name }} {{ ownerOf(inc)?.phone }}</span>
          <span class="tag">上报：{{ inc.createdBy }} · {{ fmtTime(inc.createdAt) }}</span>
          <StatusBadge v-if="itemOf(inc)" :status="itemOf(inc)!.status" />
        </div>

        <!-- 实物问题：问题照片 / 缺件说明 / 双方到场 / 对方选择 -->
        <template v-if="inc.type === 'item_problem' || inc.type === 'mediation'">
          <ProblemContext :inc="inc" />
        </template>

        <div class="divider" />
        <div class="log-list">
          <div v-for="(log, i) in inc.logs" :key="i" class="log-row">
            <span class="badge" :class="roleTone(log.role)">{{ ROLE_META[log.role].label }}</span>
            <div>
              <b>{{ log.actor }}</b> <span class="small muted">· {{ fmtTime(log.at) }}</span>
              <div class="small">{{ log.message }}</div>
            </div>
          </div>
        </div>
        <div v-if="inc.resolution" class="notice success mt12">✅ 处理结论：{{ inc.resolution }}</div>

        <!-- 实物冻结 / 调解：专用处置面板 -->
        <ProblemActions
          v-if="inc.status !== 'resolved' && (inc.type === 'item_problem' || inc.type === 'mediation')"
          :inc="inc"
        />

        <!-- 其他异常：原有通用处置 -->
        <template v-else-if="inc.status !== 'resolved'">
          <div class="row mt12">
            <input v-model="drafts[inc.id]" class="input" placeholder="记录处理进展（家长与志愿者可见）……" @keyup.enter="addLog(inc)" />
            <button class="btn outline" @click="addLog(inc)">记录</button>
          </div>
          <div v-if="inc.type === 'value_dispute'" class="row mt12">
            <button class="btn sm danger" @click="escalateMediation(inc)">🧑‍⚖️ 双方无法达成一致，升级人工调解（维持现状，冻结结果）</button>
          </div>
          <div class="row wrap mt12">
            <select v-model="choices[inc.id]" class="select" style="max-width: 340px">
              <option value="">选择处理方案……</option>
              <option v-for="(opt, i) in optionsOf(inc.type)" :key="i" :value="i">{{ opt.label }}</option>
            </select>
            <input v-model="resolutions[inc.id]" class="input" style="flex: 1" placeholder="处理结论说明（必填）" />
            <button class="btn primary" @click="resolve(inc)">办结</button>
          </div>
        </template>
      </div>
    </template>
    <div v-else class="card">
      <EmptyState icon="🕊️" text="该分类下暂无异常事件" />
    </div>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import AppShell from '../../components/AppShell.vue'
import EmptyState from '../../components/EmptyState.vue'
import StatusBadge from '../../components/StatusBadge.vue'
import ProblemContext from '../../components/ProblemContext.vue'
import ProblemActions from '../../components/ProblemActions.vue'
import { useAuthStore } from '../../stores/auth'
import { useDataStore, type ResolveEffects } from '../../stores/data'
import { INCIDENT_META, ROLE_META } from '../../meta'
import { fmtTime } from '../../utils'
import type { Incident, IncidentStatus, IncidentType, Role } from '../../types'

const auth = useAuthStore()
const data = useDataStore()

const tabs = [
  { key: 'open', label: '🔴 待处理' },
  { key: 'processing', label: '🔵 处理中' },
  { key: 'resolved', label: '✅ 已解决' },
  { key: 'all', label: '全部' },
] as const
const tab = ref<(typeof tabs)[number]['key']>('open')

const filtered = computed(() =>
  tab.value === 'all' ? data.incidents : data.incidents.filter((i) => i.status === tab.value),
)
function countOf(key: string) {
  return key === 'all' ? data.incidents.length : data.incidents.filter((i) => i.status === key).length
}

const drafts = reactive<Record<string, string>>({})
const resolutions = reactive<Record<string, string>>({})
const choices = reactive<Record<string, number | ''>>({})

/** 各异常类型可选的通用处理方案及其对物品/组合的状态影响 */
const OPTIONS: Partial<Record<IncidentType, { label: string; effects: ResolveEffects }[]>> = {
  no_show: [
    { label: '配对物品转入自由交换区，本场交换取消', effects: { counterpartStatus: 'free_zone', matchStatus: 'failed' } },
    { label: '配对物品由家长带回', effects: { counterpartStatus: 'taken_back', matchStatus: 'failed' } },
  ],
  photo_mismatch: [
    { label: '物品由家长带回，配对物品回自由交换区', effects: { itemStatus: 'taken_back', counterpartStatus: 'free_zone', matchStatus: 'failed' } },
    { label: '复核无误，恢复核销通过', effects: { itemStatus: 'verified' } },
  ],
  child_regret: [
    { label: '尊重孩子意愿，物品带回；配对物品回自由交换区', effects: { itemStatus: 'taken_back', counterpartStatus: 'free_zone', matchStatus: 'failed' } },
    { label: '物品转自由交换区再试试', effects: { itemStatus: 'free_zone', counterpartStatus: 'free_zone', matchStatus: 'failed' } },
  ],
  value_dispute: [
    { label: '协商一致，继续完成交换', effects: { itemStatus: 'verified' } },
    { label: '取消本次交换，双方回自由交换区', effects: { itemStatus: 'free_zone', counterpartStatus: 'free_zone', matchStatus: 'failed' } },
  ],
  charity_capacity: [
    { label: '协调其他公益机构接收', effects: { itemStatus: 'donated' } },
    { label: '暂存社区，等待下一场活动', effects: { itemStatus: 'no_exchange' } },
    { label: '家长自行带回', effects: { itemStatus: 'taken_back' } },
  ],
}

function optionsOf(type: IncidentType) {
  return OPTIONS[type] ?? []
}
function itemOf(inc: Incident) {
  return data.itemById(inc.itemId)
}
function ownerOf(inc: Incident) {
  const item = itemOf(inc)
  return item ? data.userById(item.parentId) : undefined
}
function statusLabel(s: IncidentStatus) {
  return { open: '待处理', processing: '处理中', resolved: '已解决' }[s]
}
function statusTone(s: IncidentStatus) {
  return { open: 'red', processing: 'blue', resolved: 'green' }[s]
}
function roleTone(role: Role) {
  return { parent: 'orange', staff: 'blue', volunteer: 'teal', charity: 'pink' }[role]
}
function addLog(inc: Incident) {
  const msg = drafts[inc.id]
  if (!msg?.trim()) return
  data.addIncidentLog(inc.id, auth.currentUser!.name, 'staff', msg)
  drafts[inc.id] = ''
}
function escalateMediation(inc: Incident) {
  const note = prompt('记录人工调解要点（调解期间维持现状，任何一方不得单独改写交换结果）', '已约双方面对面调解')
  if (note === null || !note.trim()) return
  data.addIncidentLog(inc.id, auth.currentUser!.name, 'staff', `【转人工调解】${note.trim()}（冻结当前交换结果，调解达成一致后再办结）`)
}
function resolve(inc: Incident) {
  const idx = choices[inc.id]
  const resolution = resolutions[inc.id]?.trim()
  if (idx === undefined || idx === '') return alert('请选择处理方案')
  if (!resolution) return alert('请填写处理结论说明')
  data.resolveIncident(inc.id, auth.currentUser!.name, resolution, OPTIONS[inc.type]![idx].effects)
}
</script>

<style scoped>
.log-list { display: flex; flex-direction: column; gap: 10px; }
.log-row { display: flex; gap: 10px; align-items: flex-start; }
.log-row .badge { flex-shrink: 0; margin-top: 2px; }
</style>
