<template>
  <AppShell>
    <h2 class="page-title">活动总结</h2>
    <p class="page-desc">交换成功率、未到场名单、捐赠去向、争议处理与下一场活动的品类缺口</p>

    <PhaseBar />

    <div class="grid cols-4 mt16">
      <div class="card stat-card"><div class="num">{{ summary.submittedCount }}</div><div class="lbl">报名物品（件）</div></div>
      <div class="card stat-card"><div class="num">{{ summary.reviewedCount ? Math.round((summary.approvedCount / summary.reviewedCount) * 100) : 0 }}%</div><div class="lbl">审核通过率（{{ summary.approvedCount }}/{{ summary.reviewedCount }}）</div></div>
      <div class="card stat-card"><div class="num">{{ summary.arrivalRate }}%</div><div class="lbl">预约到场率</div></div>
      <div class="card stat-card"><div class="num" style="color: var(--green)">{{ summary.successRate }}%</div><div class="lbl">交换成功率（{{ summary.exchangedCount }}/{{ summary.arrivedCount }} 件到场）</div></div>
    </div>

    <div class="grid cols-2 mt16">
      <div class="card">
        <div class="card-title">📦 物品去向分布</div>
        <div class="bar-row"><span class="bar-label">交换成功</span><div class="bar-track"><div class="bar-fill green" :style="{ width: pct(summary.exchangedCount) }" /></div><span class="bar-num">{{ summary.exchangedCount }} 件</span></div>
        <div class="bar-row"><span class="bar-label">公益转捐</span><div class="bar-track"><div class="bar-fill" style="background: var(--pink)" :style="{ width: pct(summary.donated.length) }" /></div><span class="bar-num">{{ summary.donated.length }} 件</span></div>
        <div class="bar-row"><span class="bar-label">无人交换</span><div class="bar-track"><div class="bar-fill" style="background: var(--orange)" :style="{ width: pct(summary.noExchange.length) }" /></div><span class="bar-num">{{ summary.noExchange.length }} 件</span></div>
        <div class="bar-row"><span class="bar-label">家长带回</span><div class="bar-track"><div class="bar-fill" style="background: var(--gray)" :style="{ width: pct(summary.takenBack.length) }" /></div><span class="bar-num">{{ summary.takenBack.length }} 件</span></div>
        <div class="bar-row"><span class="bar-label">未到场</span><div class="bar-track"><div class="bar-fill red" :style="{ width: pct(summary.noShow.length) }" /></div><span class="bar-num">{{ summary.noShow.length }} 件</span></div>
      </div>

      <div class="card">
        <div class="card-title">📊 下一场品类缺口分析</div>
        <div v-for="g in summary.gap" :key="g.category" class="bar-row">
          <span class="bar-label">{{ g.icon }} {{ g.label }}</span>
          <div class="bar-track">
            <div class="bar-fill" :class="g.gap > 0 ? 'red' : 'green'" :style="{ width: pct(g.demand, maxDemand) }" />
          </div>
          <span class="bar-num">需 {{ g.demand }} / 供 {{ g.supply }}</span>
        </div>
        <div v-if="gapAdvice.length" class="notice warn mt12">
          💡 建议下一场重点招募：<b>{{ gapAdvice.join('、') }}</b>（需求大于供给）
        </div>
        <div v-else class="notice success mt12">✅ 各品类供需基本平衡</div>
      </div>
    </div>

    <div class="grid cols-2 mt16">
      <div class="card">
        <div class="card-title">🚫 未到场名单（{{ summary.noShow.length }}）</div>
        <table v-if="summary.noShow.length" class="table">
          <thead><tr><th>物品</th><th>家长</th><th>联系方式</th><th>原摊位</th></tr></thead>
          <tbody>
            <tr v-for="item in summary.noShow" :key="item.id">
              <td>{{ item.name }}</td>
              <td>{{ data.userById(item.parentId)?.name }}</td>
              <td class="small">{{ data.userById(item.parentId)?.phone }}</td>
              <td>{{ item.booth ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
        <EmptyState v-else icon="✅" text="无未到场记录" />
      </div>

      <div class="card">
        <div class="card-title">💚 捐赠去向（{{ summary.donated.length }} 件）</div>
        <template v-if="donationRows.length">
          <div v-for="row in donationRows" :key="row.org" class="mb12">
            <div style="font-weight: 700">🏢 {{ row.org }} <span class="badge pink">{{ row.items.length }} 件</span></div>
            <div class="tag-list mt8">
              <span v-for="i in row.items" :key="i.id" class="tag">{{ i.name }}（{{ data.userById(i.parentId)?.name }}）</span>
            </div>
          </div>
        </template>
        <EmptyState v-else icon="💚" text="暂无捐赠记录" />
      </div>
    </div>

    <div class="card mt16">
      <div class="card-title">⚖️ 争议与异常处理（{{ data.incidents.length }} 起）</div>
      <table v-if="data.incidents.length" class="table">
        <thead><tr><th>事件</th><th>类型</th><th>关联物品</th><th>状态</th><th>处理结论</th></tr></thead>
        <tbody>
          <tr v-for="inc in data.incidents" :key="inc.id">
            <td>{{ inc.title }}</td>
            <td>{{ INCIDENT_META[inc.type].label }}</td>
            <td>{{ data.itemById(inc.itemId)?.name }}</td>
            <td>
              <span class="badge" :class="inc.status === 'resolved' ? 'green' : inc.status === 'processing' ? 'blue' : 'red'">
                {{ inc.status === 'resolved' ? '已解决' : inc.status === 'processing' ? '处理中' : '待处理' }}
              </span>
            </td>
            <td class="small muted">{{ inc.resolution ?? '—' }}</td>
          </tr>
        </tbody>
      </table>
      <EmptyState v-else icon="🕊️" text="本场活动无争议事件" />
    </div>
  </AppShell>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AppShell from '../../components/AppShell.vue'
import PhaseBar from '../../components/PhaseBar.vue'
import EmptyState from '../../components/EmptyState.vue'
import { useDataStore } from '../../stores/data'
import { INCIDENT_META } from '../../meta'

const data = useDataStore()
const summary = computed(() => data.summary)

const maxDemand = computed(() => Math.max(1, ...summary.value.gap.map((g) => g.demand)))

function pct(n: number, base?: number) {
  const b = base ?? Math.max(1, summary.value.submittedCount)
  return `${Math.round((n / b) * 100)}%`
}

const gapAdvice = computed(() => summary.value.gap.filter((g) => g.gap > 0).map((g) => g.label))

const donationRows = computed(() => {
  const rows: { org: string; items: typeof summary.value.donated }[] = []
  for (const item of summary.value.donated) {
    const donation = data.donations.find((d) => d.itemId === item.id && d.status === 'received')
    const org = donation ? data.userById(donation.charityId)?.orgName ?? '公益机构' : '公益机构'
    const row = rows.find((r) => r.org === org)
    if (row) row.items.push(item)
    else rows.push({ org, items: [item] })
  }
  return rows
})
</script>
