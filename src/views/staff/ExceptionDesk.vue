<template>
  <AppShell>
    <h2 class="page-title">异常处置台</h2>
    <p class="page-desc">社区依据现场复核与原始描述处置：冻结复核、双方分别处理、改约、摊位优先级补偿与人工调解，任一方都不能单方面改写交换结果</p>

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
          <span v-if="inc.mediation" class="badge indigo">
            人工调解{{ inc.mediation.status === 'done' ? '已办结' : '进行中' }}
          </span>
        </div>

        <!-- 实物问题标记与照片 -->
        <template v-if="inc.flags?.length || problemItem(inc)?.status === 'frozen'">
          <div class="divider" />
          <div class="tag-list">
            <span v-for="f in inc.flags" :key="f" class="badge red">{{ PROBLEM_FLAG_META[f].icon }} {{ PROBLEM_FLAG_META[f].label }}</span>
            <span v-if="problemItem(inc)?.rejectCount" class="badge amber">
              累计现场退回 {{ problemItem(inc)?.rejectCount }} 次
            </span>
            <span v-if="problemItem(inc)?.intensiveReview" class="badge rose">需强化照片复核</span>
          </div>
          <div v-if="problemItem(inc)?.checkIn?.missingPartsNote" class="notice warn mt8">
            缺件说明：{{ problemItem(inc)?.checkIn?.missingPartsNote }}
          </div>
          <div v-if="(inc.issuePhotos ?? problemItem(inc)?.issuePhotos)?.length" class="row wrap mt12">
            <div v-for="(p, i) in (inc.issuePhotos ?? problemItem(inc)?.issuePhotos)" :key="i">
              <ItemPhoto :photo="p" :category="problemItem(inc)!.category" lg />
            </div>
          </div>
        </template>

        <!-- 冻结组合的双方到场与选择情况 -->
        <template v-if="inc.type === 'item_discrepancy' && matchOf(inc)">
          <div class="divider" />
          <table class="table">
            <thead><tr><th>侧</th><th>物品 / 家长</th><th>到场情况</th><th>摊位 / 时段</th><th>当前状态</th></tr></thead>
            <tbody>
              <tr v-for="side in sidesOf(inc)" :key="side.item.id">
                <td>
                  <span class="badge" :class="side.isProblem ? 'red' : 'teal'">
                    {{ side.isProblem ? '问题物品' : '原撮合对象' }}
                  </span>
                </td>
                <td>{{ side.item.name }}<div class="small muted">{{ data.userById(side.item.parentId)?.name }}</div></td>
                <td>{{ side.item.checkIn ? `已到场核销（${side.item.checkIn.passed ? '通过' : '存疑/冻结'}）` : '未到场核销' }}</td>
                <td>{{ side.item.booth ?? '（已释放摊位）' }} · {{ side.item.entryTime ?? '—' }}</td>
                <td><StatusBadge :status="side.item.status" /></td>
              </tr>
            </tbody>
          </table>
          <div class="notice info mt8">
            原撮合对象选择：
            <b>{{ matchOf(inc)?.rollout ? ROLLOUT_META[matchOf(inc)!.rollout!.choice].label : '尚未选择' }}</b>
            <span v-if="matchOf(inc)?.rollout?.note" class="small muted">；说明：{{ matchOf(inc)?.rollout?.note }}</span>
          </div>
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

        <template v-if="inc.status !== 'resolved'">
          <div class="row mt12">
            <input v-model="drafts[inc.id]" class="input" placeholder="记录处理进展（家长与志愿者可见）……" @keyup.enter="addLog(inc)" />
            <button class="btn outline" @click="addLog(inc)">记录</button>
          </div>

          <!-- 现场实物不符：复核处置面板 -->
          <template v-if="inc.type === 'item_discrepancy'">
            <div class="action-panel mt12">
              <div class="panel-title">🔍 社区现场复核（比对原始描述与问题照片）</div>
              <div class="row wrap">
                <button class="btn sm success" @click="frozenAction(inc, 'pass')">✅ 复核放行</button>
                <button class="btn sm danger" @click="frozenAction(inc, 'reject')">🚫 确认不符·退回家长</button>
                <button class="btn sm outline" @click="frozenAction(inc, 're_review')">📸 转强化照片复核</button>
                <button class="btn sm primary" @click="frozenAction(inc, 'donate')">💚 协调转捐</button>
              </div>
              <div class="row wrap mt8">
                <select v-model="rescheduleSlot[inc.id]" class="select" style="max-width: 200px">
                  <option value="">为对方改约时段…</option>
                  <option v-for="s in event.timeSlots" :key="s" :value="s">{{ s }}</option>
                </select>
                <button class="btn sm outline" :disabled="!rescheduleSlot[inc.id]" @click="doReschedule(inc)">🕐 改约</button>
                <button class="btn sm outline" @click="doCompensate(inc)">⭐ 补偿对方摊位优先级</button>
              </div>
              <div class="small muted mt8">
                捐赠校验：家长授权 {{ authBadge(itemOf(inc)?.acceptDonation) }} ·
                公益剩余接收能力 {{ charityCapacity }} 件
              </div>
            </div>
          </template>

          <!-- 价值争议：人工调解 -->
          <template v-else-if="inc.type === 'value_dispute' && !inc.mediation">
            <div class="row mt12">
              <input v-model="mediationMsg[inc.id]" class="input" placeholder="转人工调解说明（依据现场复核与原始描述）……" />
              <button class="btn primary" @click="toMediation(inc)">🤝 转人工调解</button>
            </div>
          </template>

          <template v-if="inc.mediation && inc.mediation.status !== 'done'">
            <div class="notice indigo mt12" style="background: #ebebfd">
              🤝 人工调解进行中：调解结论作出前双方均不能改写交换结果。办结时请选择最终处置：
            </div>
          </template>

          <!-- 通用处理方案（含调解办结） -->
          <div v-if="inc.type !== 'item_discrepancy'" class="row wrap mt12">
            <select v-model="choices[inc.id]" class="select" style="max-width: 360px">
              <option value="">选择处理方案……</option>
              <option v-for="(opt, i) in optionsOf(inc.type)" :key="i" :value="i">{{ opt.label }}</option>
            </select>
            <input v-model="resolutions[inc.id]" class="input" style="flex: 1; min-width: 220px" placeholder="处理结论说明（必填）" />
            <button class="btn primary" @click="resolve(inc)">
              {{ inc.mediation ? '办结调解' : '办结' }}
            </button>
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
import ItemPhoto from '../../components/ItemPhoto.vue'
import { useAuthStore } from '../../stores/auth'
import { useDataStore, type ResolveEffects } from '../../stores/data'
import { INCIDENT_META, PROBLEM_FLAG_META, ROLLOUT_META, ROLE_META } from '../../meta'
import { fmtTime } from '../../utils'
import type { Incident, IncidentStatus, IncidentType, Item, Match, Role } from '../../types'

const auth = useAuthStore()
const data = useDataStore()
const event = computed(() => data.event)

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
const mediationMsg = reactive<Record<string, string>>({})
const rescheduleSlot = reactive<Record<string, string>>({})

/** 各异常类型可选的处理方案及其对物品/组合的状态影响 */
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
    { label: '调解成立：双方认可，继续完成交换', effects: { itemStatus: 'verified' } },
    { label: '调解不成：取消交换，双方回自由交换区', effects: { itemStatus: 'free_zone', counterpartStatus: 'free_zone', matchStatus: 'failed' } },
    { label: '调解不成：双方物品各自带回', effects: { itemStatus: 'taken_back', counterpartStatus: 'taken_back', matchStatus: 'failed' } },
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
function itemOf(inc: Incident): Item | undefined {
  return data.itemById(inc.itemId)
}
function problemItem(inc: Incident): Item | undefined {
  return itemOf(inc)
}
function ownerOf(inc: Incident) {
  const item = itemOf(inc)
  return item ? data.userById(item.parentId) : undefined
}
function matchOf(inc: Incident): Match | undefined {
  return inc.matchId ? data.matchById(inc.matchId) : data.frozenMatchForItem(inc.itemId)
}
function sidesOf(inc: Incident) {
  const m = matchOf(inc)
  const problem = itemOf(inc)!
  if (!m) return [{ item: problem, isProblem: true }]
  const otherId = m.itemAId === problem.id ? m.itemBId : m.itemAId
  const other = data.itemById(otherId)
  return [
    { item: problem, isProblem: true },
    ...(other ? [{ item: other, isProblem: false }] : []),
  ]
}
const charityCapacity = computed(() => data.users.find((u) => u.role === 'charity')?.capacity ?? 0)
function authBadge(ok?: boolean) {
  return ok ? '✅ 已授权' : '❌ 未授权'
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

/** 冻结物品复核处置 */
function frozenAction(inc: Incident, action: 'pass' | 'reject' | 're_review' | 'donate') {
  const item = itemOf(inc)
  if (!item) return
  const labels = { pass: '复核放行', reject: '确认实物不符，退回家长带回', re_review: '转强化照片复核与缺件说明流程', donate: '协调公益转捐' }
  const note = prompt(`${labels[action]}——请填写现场复核结论（比对原始描述与问题照片）`, '')
  if (note === null) return
  if (!note.trim()) return alert('必须填写现场复核结论')
  const res = data.reviewFrozenItem(item.id, action, auth.currentUser!.name, note.trim())
  if (!res.ok) alert(res.error ?? '处置失败')
}

function doReschedule(inc: Incident) {
  const slot = rescheduleSlot[inc.id]
  const m = matchOf(inc)
  const problem = itemOf(inc)
  if (!slot || !m || !problem) return
  const otherId = m.itemAId === problem.id ? m.itemBId : m.itemAId
  const res = data.rescheduleItem(otherId, slot, auth.currentUser!.name, '一方物品冻结，社区为到场一方协调改约')
  alert(res.ok ? `已为对方改约至 ${slot}` : res.error)
  if (res.ok) rescheduleSlot[inc.id] = ''
}

function doCompensate(inc: Incident) {
  const m = matchOf(inc)
  const problem = itemOf(inc)
  if (!m || !problem) return
  const otherId = m.itemAId === problem.id ? m.itemBId : m.itemAId
  const other = data.itemById(otherId)
  if (!other) return
  if (!confirm('确认为受影响的对方家庭补偿 1 个摊位优先权重（下一场优先安排摊位）？')) return
  data.compensateBoothPriority(other.parentId, auth.currentUser!.name, '因对方物品现场实物不符导致交换受影响，社区补偿摊位优先级')
}

function toMediation(inc: Incident) {
  const msg = mediationMsg[inc.id]?.trim()
  if (!msg) return alert('请填写转人工调解说明')
  data.startMediation(inc.id, auth.currentUser!.name, msg)
  mediationMsg[inc.id] = ''
}

function resolve(inc: Incident) {
  const idx = choices[inc.id]
  const resolution = resolutions[inc.id]?.trim()
  if (idx === undefined || idx === '') return alert('请选择处理方案')
  if (!resolution) return alert('请填写处理结论说明')
  const opts = optionsOf(inc.type)
  if (inc.mediation) {
    data.finishMediation(inc.id, auth.currentUser!.name, resolution, opts[idx].effects)
  } else {
    data.resolveIncident(inc.id, auth.currentUser!.name, resolution, opts[idx].effects)
  }
}
</script>

<style scoped>
.log-list { display: flex; flex-direction: column; gap: 10px; }
.log-row { display: flex; gap: 10px; align-items: flex-start; }
.log-row .badge { flex-shrink: 0; margin-top: 2px; }
.action-panel {
  border: 1px dashed var(--line);
  border-radius: 12px;
  padding: 12px 14px;
  background: #fffdf9;
}
.panel-title { font-weight: 700; margin-bottom: 10px; font-size: 13.5px; }
</style>
