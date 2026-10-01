<template>
  <AppShell>
    <h2 class="page-title">现场总览</h2>
    <p class="page-desc">跟踪到场、核销与交换进度，处理预约组合的现场成交</p>

    <PhaseBar />

    <div class="grid cols-4 mt16">
      <div class="card stat-card"><div class="num">{{ data.reservedItems.length }}</div><div class="lbl">待到场（已预约）</div></div>
      <div class="card stat-card"><div class="num">{{ data.arrivedItems.length }}</div><div class="lbl">已到场 / 核销</div></div>
      <div class="card stat-card"><div class="num" style="color: var(--green)">{{ exchangedCount }}</div><div class="lbl">交换成功</div></div>
      <div class="card stat-card">
        <div class="num" style="color: var(--red)">{{ data.frozenItems.length + data.summary.noShow.length }}</div>
        <div class="lbl">冻结 {{ data.frozenItems.length }} · 未到场 {{ data.summary.noShow.length }}</div>
      </div>
    </div>

    <div v-if="frozenMatches.length" class="card mt16" style="border-color: #f2c6c6">
      <div class="card-title">🧊 冻结 / 回滚中的组合（{{ frozenMatches.length }}）</div>
      <table class="table">
        <thead><tr><th>摊位</th><th>物品 A</th><th>物品 B</th><th>问题</th><th>对方选择</th><th>状态</th></tr></thead>
        <tbody>
          <tr v-for="m in frozenMatches" :key="m.id">
            <td>{{ m.booth ? `摊位 ${m.booth}（复核保留中）` : '已释放' }}</td>
            <td>{{ itemName(m.itemAId) }}</td>
            <td>{{ itemName(m.itemBId) }}</td>
            <td class="small" style="color: var(--red)">{{ problemText(m) }}</td>
            <td>{{ m.rollout ? ROLLOUT_META[m.rollout.choice].label : '待对方选择' }}</td>
            <td><span class="badge" :class="m.status === 'frozen' ? 'red' : 'amber'">{{ m.status === 'frozen' ? '已冻结' : '等待替代' }}</span></td>
          </tr>
        </tbody>
      </table>
      <p class="small muted mt8">请到「异常处置」完成现场复核；复核放行且对方选择继续交换后，组合才恢复可成交。</p>
    </div>

    <div class="card mt16">
      <div class="card-title">🤝 预约组合现场成交</div>
      <table v-if="confirmedMatches.length" class="table">
        <thead>
          <tr><th>摊位</th><th>物品 A</th><th>物品 B</th><th>双方状态</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="m in confirmedMatches" :key="m.id">
            <td><span class="badge indigo">{{ m.booth }}</span></td>
            <td>{{ itemName(m.itemAId) }}</td>
            <td>{{ itemName(m.itemBId) }}</td>
            <td>
              <StatusBadge :status="itemStatus(m.itemAId)" />
              <StatusBadge :status="itemStatus(m.itemBId)" style="margin-left: 4px" />
            </td>
            <td>
              <button
                class="btn sm success"
                :disabled="!data.canConfirmExchange(m)"
                @click="complete(m.id)"
              >✅ 确认交换完成</button>
              <div v-if="bothVerified(m) && !data.canConfirmExchange(m)" class="small" style="color: var(--red)">
                存在未解决争议/调解，办结后方可成交
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <EmptyState v-else icon="🤝" text="暂无进行中的预约组合" />
    </div>

    <div class="card">
      <div class="card-title">🎪 自由交换区现场登记</div>
      <div class="row wrap">
        <select v-model="freeA" class="select" style="max-width: 260px">
          <option value="">选择物品 A</option>
          <option v-for="i in freeCandidates" :key="i.id" :value="i.id">{{ i.name }}（{{ data.userById(i.parentId)?.name }}）</option>
        </select>
        <span style="font-size: 18px">🔄</span>
        <select v-model="freeB" class="select" style="max-width: 260px">
          <option value="">选择物品 B</option>
          <option v-for="i in freeCandidatesB" :key="i.id" :value="i.id">{{ i.name }}（{{ data.userById(i.parentId)?.name }}）</option>
        </select>
        <button class="btn primary" :disabled="!freeA || !freeB" @click="registerFree">登记自由交换</button>
      </div>
      <p class="small muted mt8">自由交换区 / 已到场 / 等待替代物品的物品，双方家长现场确认后即可登记成交</p>
    </div>

    <div class="card">
      <div class="card-title">⏰ 待到场物品（已预约）</div>
      <table v-if="data.reservedItems.length" class="table">
        <thead><tr><th>物品</th><th>家长</th><th>摊位</th><th>入场时段</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="item in data.reservedItems" :key="item.id">
            <td>{{ item.name }}（{{ item.code }}）</td>
            <td>{{ data.userById(item.parentId)?.name }} {{ data.userById(item.parentId)?.phone }}</td>
            <td>{{ item.booth }}</td>
            <td>{{ item.entryTime }}</td>
            <td><button class="btn sm danger" @click="noShow(item.id)">标记未到场</button></td>
          </tr>
        </tbody>
      </table>
      <EmptyState v-else icon="✅" text="所有预约物品均已到场或处理完毕" />
    </div>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import AppShell from '../../components/AppShell.vue'
import PhaseBar from '../../components/PhaseBar.vue'
import StatusBadge from '../../components/StatusBadge.vue'
import EmptyState from '../../components/EmptyState.vue'
import { useAuthStore } from '../../stores/auth'
import { useDataStore } from '../../stores/data'
import { PROBLEM_FLAG_META, ROLLOUT_META } from '../../meta'
import type { ItemStatus, Match } from '../../types'

const auth = useAuthStore()
const data = useDataStore()

const confirmedMatches = computed(() => data.matches.filter((m) => m.status === 'confirmed'))
const frozenMatches = computed(() => data.matches.filter((m) => m.status === 'frozen' || m.status === 'waiting_replace'))
const exchangedCount = computed(() => data.items.filter((i) => i.status === 'exchanged').length)

const freeCandidates = computed(() =>
  data.items.filter((i) => ['free_zone', 'arrived', 'verified', 'no_exchange', 'waiting_replace'].includes(i.status)),
)
const freeA = ref('')
const freeB = ref('')
const freeCandidatesB = computed(() => freeCandidates.value.filter((x) => x.id !== freeA.value))

function itemName(id: string) {
  return data.itemById(id)?.name ?? '未知'
}
function problemText(m: Match) {
  const p = data.itemById(m.frozenItemId ?? '')
  if (!p) return '—'
  const flags = (p.freezeFlags ?? []).map((f) => PROBLEM_FLAG_META[f].label).join('、')
  return `${p.name}：${flags || '实物不符'}`
}
function itemStatus(id: string): ItemStatus {
  return data.itemById(id)?.status ?? 'pending'
}
function bothVerified(m: Match) {
  return itemStatus(m.itemAId) === 'verified' && itemStatus(m.itemBId) === 'verified'
}
function complete(matchId: string) {
  if (!data.confirmExchange(matchId, auth.currentUser!.name)) {
    alert('双方物品均需核销通过后才能确认交换')
  }
}
function noShow(itemId: string) {
  if (confirm('确认该家长未到场？将生成缺席异常并通知社区处理')) {
    data.markNoShow(itemId, auth.currentUser!.name)
  }
}
function registerFree() {
  if (data.onsiteFreeExchange(freeA.value, freeB.value, auth.currentUser!.name)) {
    freeA.value = ''
    freeB.value = ''
  } else {
    alert('登记失败，请确认两件物品均在现场可交换')
  }
}
</script>
