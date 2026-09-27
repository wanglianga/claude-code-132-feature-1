<template>
  <AppShell>
    <h2 class="page-title">捐赠接收</h2>
    <p class="page-desc">接收本场活动无人交换且家长同意捐赠的物品；接收能力不足时可拒收，由社区协调其他去向</p>

    <div class="grid cols-3">
      <div class="card stat-card"><div class="num">{{ me?.capacity ?? 0 }}</div><div class="lbl">剩余接收能力（件）</div></div>
      <div class="card stat-card"><div class="num" style="color: var(--pink)">{{ received.length }}</div><div class="lbl">本场已接收</div></div>
      <div class="card stat-card"><div class="num" style="color: var(--amber)">{{ requested.length }}</div><div class="lbl">待处理申请</div></div>
    </div>

    <div class="card mt16">
      <div class="card-title">📥 待处理捐赠申请（{{ requested.length }}）</div>
      <template v-if="requested.length">
        <div v-for="d in requested" :key="d.id" class="donation-row">
          <ItemCard :item="itemOf(d)!" show-owner>
            <template #actions>
              <button class="btn sm success" :disabled="(me?.capacity ?? 0) <= 0" @click="accept(d)">✅ 确认接收</button>
              <button class="btn sm danger" @click="decline(d)">📦 接收能力不足，拒收</button>
            </template>
          </ItemCard>
          <div v-if="(me?.capacity ?? 0) <= 0" class="notice warn" style="margin-bottom: 10px">
            当前接收能力已用完，新增接收前请联系社区扩容
          </div>
        </div>
      </template>
      <EmptyState v-else icon="📥" text="暂无待处理的捐赠申请" />
    </div>

    <div class="card">
      <div class="card-title">💚 已接收物品（{{ received.length }}）</div>
      <table v-if="received.length" class="table">
        <thead><tr><th>物品</th><th>捐赠家长</th><th>品类</th><th>去向备注</th><th>接收时间</th></tr></thead>
        <tbody>
          <tr v-for="d in received" :key="d.id">
            <td>{{ itemOf(d)?.name }}</td>
            <td>{{ parentOf(d) }}</td>
            <td>{{ itemOf(d) ? CATEGORY_META[itemOf(d)!.category].label : '' }}</td>
            <td class="small muted">{{ d.note ?? '统一消杀后送往帮扶家庭' }}</td>
            <td class="small muted">{{ fmtTime(d.createdAt) }}</td>
          </tr>
        </tbody>
      </table>
      <EmptyState v-else icon="💚" text="暂无接收记录" />
    </div>

    <div class="card">
      <div class="card-title">🚫 已拒收（{{ declined.length }}）</div>
      <table v-if="declined.length" class="table">
        <thead><tr><th>物品</th><th>家长</th><th>拒收原因</th></tr></thead>
        <tbody>
          <tr v-for="d in declined" :key="d.id">
            <td>{{ itemOf(d)?.name }}</td>
            <td>{{ parentOf(d) }}</td>
            <td class="small muted">{{ d.note ?? '接收能力不足' }}</td>
          </tr>
        </tbody>
      </table>
      <EmptyState v-else icon="🚫" text="暂无拒收记录" />
    </div>
  </AppShell>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AppShell from '../../components/AppShell.vue'
import ItemCard from '../../components/ItemCard.vue'
import EmptyState from '../../components/EmptyState.vue'
import { useAuthStore } from '../../stores/auth'
import { useDataStore } from '../../stores/data'
import { CATEGORY_META } from '../../meta'
import { fmtTime } from '../../utils'
import type { Donation } from '../../types'

const auth = useAuthStore()
const data = useDataStore()

const me = computed(() => auth.currentUser)
const myDonations = computed(() => data.donations.filter((d) => d.charityId === me.value!.id))
const requested = computed(() => myDonations.value.filter((d) => d.status === 'requested'))
const received = computed(() => myDonations.value.filter((d) => d.status === 'received'))
const declined = computed(() => myDonations.value.filter((d) => d.status === 'declined'))

function itemOf(d: Donation) {
  return data.itemById(d.itemId)
}
function parentOf(d: Donation) {
  const item = itemOf(d)
  return item ? data.userById(item.parentId)?.name : ''
}
function accept(d: Donation) {
  const note = prompt('去向备注（可留空）', '统一消杀后送往帮扶家庭')
  if (note === null) return
  data.respondDonation(d.id, true, me.value!.name, note || undefined)
}
function decline(d: Donation) {
  if (confirm('确认因接收能力不足拒收？系统将自动生成异常事件交由社区协调')) {
    data.respondDonation(d.id, false, me.value!.name, '接收能力不足')
  }
}
</script>

<style scoped>
.donation-row { margin-bottom: 4px; }
</style>
