<template>
  <AppShell>
    <h2 class="page-title">争议协调</h2>
    <p class="page-desc">物品在现场遇到异常时，社区、志愿者、公益机构会与您围绕同一件物品协同处理；对方物品被冻结时，您的选择会作为社区回滚处置的依据</p>

    <div v-if="myIncidents.length">
      <div v-for="inc in myIncidents" :key="inc.id" class="card">
        <div class="row between wrap">
          <div class="card-title" style="margin: 0">
            {{ INCIDENT_META[inc.type].icon }} {{ inc.title }}
          </div>
          <span class="badge" :class="inc.status === 'resolved' ? 'green' : inc.status === 'processing' ? 'blue' : 'red'">
            {{ inc.status === 'resolved' ? '已解决' : inc.status === 'processing' ? '处理中' : '待处理' }}
          </span>
        </div>
        <p class="small muted mt8">
          关联物品：{{ itemOf(inc)?.name }}（{{ itemOf(inc)?.code }}） · 上报人 {{ inc.createdBy }} · {{ fmtTime(inc.createdAt) }}
        </p>

        <!-- 实物问题：现场问题照片与缺件说明 -->
        <template v-if="inc.type === 'item_problem' && problemItem(inc)">
          <div class="divider" />
          <div v-for="(p, i) in problemItem(inc)!.problems ?? []" :key="i" class="problem-block">
            <div class="row wrap" style="gap: 6px">
              <span class="badge rose">{{ PROBLEM_META[p.type].icon }} {{ PROBLEM_META[p.type].label }}</span>
              <span class="small muted">{{ p.by }} · {{ fmtTime(p.at) }}</span>
              <span v-if="p.staffVerdict" class="badge" :class="p.staffVerdict.passed ? 'green' : 'red'">
                社区复核{{ p.staffVerdict.passed ? '通过' : '不通过' }}
              </span>
            </div>
            <div class="row wrap mt8">
              <ItemPhoto v-for="(ph, j) in p.photos" :key="j" :photo="ph" :category="problemItem(inc)!.category" />
            </div>
            <p v-if="p.missingParts" class="small mt8"><b>缺件说明：</b>{{ p.missingParts }}</p>
            <p v-if="p.note" class="small muted">{{ p.note }}</p>
            <p v-if="p.staffVerdict" class="small mt8">
              <b>现场复核（{{ p.staffVerdict.by }}）：</b>{{ p.staffVerdict.note ?? '已对照原始描述完成复核' }}
            </p>
          </div>
        </template>

        <div class="divider" />
        <div class="log-list">
          <div v-for="(log, i) in inc.logs" :key="i" class="log-row">
            <span class="badge" :class="roleTone(log.role)">{{ ROLE_META[log.role].label }}</span>
            <div>
              <span style="font-weight: 600">{{ log.actor }}</span>
              <span class="small muted"> · {{ fmtTime(log.at) }}</span>
              <div class="small">{{ log.message }}</div>
            </div>
          </div>
        </div>

        <div v-if="inc.resolution" class="notice success mt12">✅ 处理结论：{{ inc.resolution }}</div>

        <!-- 我是原撮合对象（未被冻结一方）：四选一 -->
        <FrozenChoicePanel
          v-if="inc.status !== 'resolved' && frozenContext(inc)"
          :match="frozenContext(inc)!.match"
          :my-item-id="frozenContext(inc)!.myItemId"
          @choose="choose"
        />

        <!-- 我是问题物品家长：社区拟转捐但未授权时补充授权 -->
        <template v-if="inc.status !== 'resolved' && canGrantAuth(inc)">
          <div class="notice warn mt12">
            社区拟将该物品转赠公益机构，但您报名时未授权捐赠。如同意转捐，请点击下方按钮补充授权（社区还会校验公益机构接收能力）。
            <div class="mt8">
              <button class="btn sm success" @click="grantAuth(inc)">💚 补充公益捐赠授权</button>
            </div>
          </div>
        </template>

        <div v-if="inc.status !== 'resolved'" class="row mt12">
          <input
            v-model="drafts[inc.id]"
            class="input"
            placeholder="补充说明情况，与社区协同处理……"
            @keyup.enter="send(inc)"
          />
          <button class="btn primary" @click="send(inc)">发送</button>
        </div>
      </div>
    </div>
    <div v-else class="card">
      <EmptyState icon="🕊️" text="您的物品没有进行中的争议或异常" />
    </div>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import AppShell from '../../components/AppShell.vue'
import EmptyState from '../../components/EmptyState.vue'
import ItemPhoto from '../../components/ItemPhoto.vue'
import FrozenChoicePanel from '../../components/FrozenChoicePanel.vue'
import { useAuthStore } from '../../stores/auth'
import { useDataStore } from '../../stores/data'
import { INCIDENT_META, PROBLEM_META, ROLE_META } from '../../meta'
import { fmtTime } from '../../utils'
import type { CounterpartChoiceKind, Incident, Match, Role } from '../../types'

const auth = useAuthStore()
const data = useDataStore()
const myId = auth.currentUser!.id

const myIncidents = computed(() => data.incidentsForParent(myId))

const drafts = reactive<Record<string, string>>({})

function itemOf(inc: Incident) {
  return data.itemById(inc.itemId)
}
function problemItem(inc: Incident) {
  const item = itemOf(inc)
  return item?.problems?.length ? item : null
}
function roleTone(role: Role) {
  return { parent: 'orange', staff: 'blue', volunteer: 'teal', charity: 'pink' }[role]
}
/** 若该冻结组合中我是未被冻结的一方，返回组合与我的物品 */
function frozenContext(inc: Incident): { match: Match; myItemId: string } | null {
  if (!inc.matchId) return null
  const m = data.matchById(inc.matchId)
  if (!m || m.status !== 'frozen' || !m.problemItemId) return null
  const myItemId = m.problemItemId === m.itemAId ? m.itemBId : m.itemAId
  return data.itemById(myItemId)?.parentId === myId ? { match: m, myItemId } : null
}
function choose(match: Match, kind: CounterpartChoiceKind) {
  data.counterpartChoose(match.id, myId, kind, auth.currentUser!.name)
}
function canGrantAuth(inc: Incident): boolean {
  const item = itemOf(inc)
  return !!item && item.parentId === myId && !item.acceptDonation && item.status === 'frozen'
}
function grantAuth(inc: Incident) {
  if (data.grantDonationAuth(inc.itemId, myId, auth.currentUser!.name)) {
    alert('已补充捐赠授权，社区将继续校验公益机构接收能力')
  }
}
function send(inc: Incident) {
  const msg = drafts[inc.id]
  if (!msg?.trim()) return
  data.addIncidentLog(inc.id, auth.currentUser!.name, 'parent', msg)
  drafts[inc.id] = ''
}
</script>

<style scoped>
.log-list { display: flex; flex-direction: column; gap: 10px; }
.log-row { display: flex; gap: 10px; align-items: flex-start; }
.log-row .badge { flex-shrink: 0; margin-top: 2px; }
.problem-block {
  background: #fff7fa;
  border: 1px solid #fbd9e6;
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 8px;
}
</style>
