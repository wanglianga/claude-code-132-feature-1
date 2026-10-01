<template>
  <AppShell>
    <h2 class="page-title">争议协调</h2>
    <p class="page-desc">物品在现场遇到异常时，社区、志愿者、公益机构会与您围绕同一件物品协同处理</p>

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

        <div v-if="inc.flags?.length" class="tag-list mt8">
          <span v-for="f in inc.flags" :key="f" class="badge red">{{ PROBLEM_FLAG_META[f].icon }} {{ PROBLEM_FLAG_META[f].label }}</span>
        </div>

        <div class="divider" />
        <div v-if="(inc.issuePhotos ?? itemOf(inc)?.issuePhotos)?.length" class="row wrap mb12">
          <ItemPhoto v-for="(p, i) in (inc.issuePhotos ?? itemOf(inc)?.issuePhotos)" :key="i" :photo="p" :category="itemOf(inc)!.category" />
        </div>
        <div v-if="itemOf(inc)?.checkIn?.missingPartsNote" class="notice warn mb12">
          缺件说明：{{ itemOf(inc)?.checkIn?.missingPartsNote }}
        </div>
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
import { useAuthStore } from '../../stores/auth'
import { useDataStore } from '../../stores/data'
import { INCIDENT_META, PROBLEM_FLAG_META, ROLE_META } from '../../meta'
import { fmtTime } from '../../utils'
import type { Incident, Role } from '../../types'

const auth = useAuthStore()
const data = useDataStore()
const myId = auth.currentUser!.id

const myIncidents = computed(() =>
  data.incidents.filter((i) => {
    if (data.itemById(i.itemId)?.parentId === myId) return true
    // 对方物品出问题、但组合涉及自己时，也展示给本人（只读沟通）
    if (i.matchId) {
      const m = data.matchById(i.matchId)
      if (m) {
        const a = data.itemById(m.itemAId)
        const b = data.itemById(m.itemBId)
        return a?.parentId === myId || b?.parentId === myId
      }
    }
    return false
  }),
)

const drafts = reactive<Record<string, string>>({})

function itemOf(inc: Incident) {
  return data.itemById(inc.itemId)
}
function roleTone(role: Role) {
  return { parent: 'orange', staff: 'blue', volunteer: 'teal', charity: 'pink' }[role]
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
</style>
