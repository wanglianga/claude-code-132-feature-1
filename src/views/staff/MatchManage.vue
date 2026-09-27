<template>
  <AppShell>
    <h2 class="page-title">撮合管理</h2>
    <p class="page-desc">按孩子年龄段、物品类型、价值区间、双方期望与摊位容量生成推荐组合，家长双方确认后自动分配摊位与入场时段</p>

    <PhaseBar />

    <div class="grid cols-4 mt16">
      <div class="card stat-card">
        <div class="num">{{ data.approvedPool.length }}</div>
        <div class="lbl">待撮合物品</div>
      </div>
      <div class="card stat-card">
        <div class="num">{{ pendingMatches.length }}</div>
        <div class="lbl">待家长确认</div>
      </div>
      <div class="card stat-card">
        <div class="num">{{ data.boothUsed }} / {{ event.boothCapacity }}</div>
        <div class="lbl">摊位占用</div>
      </div>
      <div class="card stat-card">
        <div class="num">{{ data.freeZoneItems.length }}</div>
        <div class="lbl">自由交换区物品</div>
      </div>
    </div>

    <div class="card mt16">
      <div class="row between wrap">
        <div class="card-title" style="margin: 0">🧩 撮合操作</div>
        <div class="row">
          <button class="btn primary" :disabled="!data.approvedPool.length" @click="runMatch">
            ⚡ 一键智能撮合
          </button>
          <button class="btn outline" :disabled="!data.approvedPool.length" @click="toFreeZone">
            📥 未匹配物品转入自由交换区
          </button>
        </div>
      </div>
      <div v-if="matchMsg" class="notice success mt12">{{ matchMsg }}</div>
      <div class="bar-row mt12">
        <span class="bar-label">摊位容量</span>
        <div class="bar-track">
          <div class="bar-fill" :style="{ width: `${Math.min(100, (data.boothUsed / event.boothCapacity) * 100)}%` }" />
        </div>
        <span class="bar-num">{{ data.boothUsed }}/{{ event.boothCapacity }} 个摊位</span>
      </div>
      <p class="small muted">撮合评分 = 双方期望品类（各 30 分）+ 年龄段契合（15）+ 价值区间契合（15）+ 到场时间重合（10）+ 双方已消毒（5）；≥ 40 分才生成组合，且不超过剩余摊位数。</p>
    </div>

    <div class="card">
      <div class="card-title">📬 撮合组合（{{ activeMatches.length }} 组进行中）</div>
      <template v-if="activeMatches.length">
        <div v-for="m in activeMatches" :key="m.id" class="match-row">
          <div class="row between wrap">
            <div style="flex: 1; min-width: 260px">
              <b>{{ itemName(m.itemAId) }}</b> 🔄 <b>{{ itemName(m.itemBId) }}</b>
              <div class="tag-list mt8">
                <span class="tag">匹配 {{ m.score }} 分</span>
                <span v-for="(r, i) in m.reasons" :key="i" class="tag">{{ r }}</span>
              </div>
            </div>
            <span class="badge" :class="matchTone(m.status)">{{ matchLabel(m.status) }}</span>
          </div>
        </div>
      </template>
      <EmptyState v-else icon="🧩" text="暂无进行中的撮合，点击「一键智能撮合」生成推荐组合" />
    </div>

    <div class="card">
      <div class="card-title">🎫 已预约（{{ confirmed.length }} 组）</div>
      <table v-if="confirmed.length" class="table">
        <thead><tr><th>交换组合</th><th>摊位</th><th>入场时段</th><th>状态</th></tr></thead>
        <tbody>
          <tr v-for="m in confirmed" :key="m.id">
            <td>{{ itemName(m.itemAId) }} 🔄 {{ itemName(m.itemBId) }}</td>
            <td><span class="badge indigo">{{ m.booth }}</span></td>
            <td>{{ m.entryTime }}</td>
            <td><span class="badge blue">已预约</span></td>
          </tr>
        </tbody>
      </table>
      <EmptyState v-else icon="🎫" text="暂无已预约的交换" />
    </div>

    <div class="card">
      <div class="card-title">📥 自由交换区（{{ data.freeZoneItems.length }} 件）</div>
      <div v-if="data.freeZoneItems.length" class="grid cols-3">
        <ItemCard v-for="item in data.freeZoneItems" :key="item.id" :item="item" show-owner />
      </div>
      <EmptyState v-else icon="📥" text="自由交换区暂无物品" />
    </div>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import AppShell from '../../components/AppShell.vue'
import PhaseBar from '../../components/PhaseBar.vue'
import ItemCard from '../../components/ItemCard.vue'
import EmptyState from '../../components/EmptyState.vue'
import { useAuthStore } from '../../stores/auth'
import { useDataStore } from '../../stores/data'
import type { MatchStatus } from '../../types'

const auth = useAuthStore()
const data = useDataStore()
const event = computed(() => data.event)

const matchMsg = ref('')

const activeMatches = computed(() =>
  data.matches.filter((m) => ['proposed', 'accepted_a', 'accepted_b'].includes(m.status)),
)
const pendingMatches = activeMatches
const confirmed = computed(() => data.matches.filter((m) => m.status === 'confirmed'))

function itemName(id: string) {
  return data.itemById(id)?.name ?? '未知物品'
}
function matchLabel(s: MatchStatus) {
  return {
    proposed: '待双方确认', accepted_a: '一方已确认', accepted_b: '一方已确认',
    confirmed: '已预约', declined: '已拒绝', cancelled: '已取消', completed: '已完成', failed: '未成交',
  }[s]
}
function matchTone(s: MatchStatus) {
  return {
    proposed: 'purple', accepted_a: 'indigo', accepted_b: 'indigo',
    confirmed: 'blue', declined: 'red', cancelled: 'gray', completed: 'green', failed: 'red',
  }[s]
}

function runMatch() {
  const n = data.runAutoMatch(auth.currentUser!.name)
  matchMsg.value = n
    ? `已生成 ${n} 组推荐组合，等待家长双方确认（可在「待家长确认」中查看）`
    : '没有满足条件的组合（分数不足或摊位已满）'
}

function toFreeZone() {
  const n = data.moveUnmatchedToFreeZone(auth.currentUser!.name)
  matchMsg.value = n ? `已将 ${n} 件未匹配物品转入自由交换区` : '待撮合池为空'
}
</script>

<style scoped>
.match-row {
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 10px;
  background: #fffdf9;
}
</style>
