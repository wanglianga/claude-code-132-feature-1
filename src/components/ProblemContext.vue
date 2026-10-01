<template>
  <div v-if="item">
    <div class="divider" />
    <!-- 现场问题记录 -->
    <div v-for="(p, i) in item.problems ?? []" :key="i" class="problem-block">
      <div class="row wrap between">
        <div class="row wrap" style="gap: 6px">
          <span class="badge rose">{{ PROBLEM_META[p.type].icon }} {{ PROBLEM_META[p.type].label }}</span>
          <span class="small muted">{{ p.by }} · {{ fmtTime(p.at) }}</span>
        </div>
        <span v-if="p.staffVerdict" class="badge" :class="p.staffVerdict.passed ? 'green' : 'red'">
          复核{{ p.staffVerdict.passed ? '通过' : '不通过' }}
        </span>
        <span v-else class="badge amber">待社区复核</span>
      </div>
      <div class="row wrap mt8">
        <ItemPhoto v-for="(ph, j) in p.photos" :key="j" :photo="ph" :category="item.category" />
      </div>
      <table class="table mt8">
        <tbody>
          <tr><th style="width: 130px">报名原始描述</th><td>{{ item.note || '（家长未填写备注）' }} · 申报成色 {{ CONDITION_META[item.condition] }} · {{ item.disinfected ? '申报已消毒' : '申报未消毒' }}</td></tr>
          <tr v-if="p.missingParts"><th>缺件说明</th><td class="red-text">{{ p.missingParts }}</td></tr>
          <tr v-if="p.note"><th>志愿者现场说明</th><td>{{ p.note }}</td></tr>
          <tr v-if="p.staffVerdict"><th>现场复核结论</th><td>{{ p.staffVerdict.by }}：{{ p.staffVerdict.note || '已对照原始描述完成复核' }}</td></tr>
        </tbody>
      </table>
    </div>

    <!-- 关联撮合与双方到场 -->
    <div v-if="match" class="match-context mt12">
      <div class="row wrap between">
        <b>🔄 关联撮合 {{ match.booth ? `· 摊位 ${match.booth} · 时段 ${match.entryTime}` : '' }}</b>
        <span class="badge rose">撮合已冻结</span>
      </div>
      <div class="grid cols-2 mt8">
        <div class="side-box" :class="{ problem: sideA.id === item.id }">
          <div class="small muted">甲方 · {{ owner(sideA)?.name }}（{{ owner(sideA)?.phone }}）</div>
          <b>{{ sideA.name }}</b>
          <div class="tag-list mt8">
            <span class="tag">{{ STATUS_META[sideA.status].label }}</span>
            <span class="tag">{{ sideA.checkIn?.passed ? '✅ 已到场核销' : sideA.checkIn ? '核销存疑' : '未到场' }}</span>
            <span class="tag">{{ sideA.acceptDonation ? '已授权捐赠' : '未授权捐赠' }}</span>
          </div>
        </div>
        <div class="side-box" :class="{ problem: sideB.id === item.id }">
          <div class="small muted">乙方 · {{ owner(sideB)?.name }}（{{ owner(sideB)?.phone }}）</div>
          <b>{{ sideB.name }}</b>
          <div class="tag-list mt8">
            <span class="tag">{{ STATUS_META[sideB.status].label }}</span>
            <span class="tag">{{ sideB.checkIn?.passed ? '✅ 已到场核销' : sideB.checkIn ? '核销存疑' : '未到场' }}</span>
            <span class="tag">{{ sideB.acceptDonation ? '已授权捐赠' : '未授权捐赠' }}</span>
          </div>
        </div>
      </div>
      <div class="row wrap mt8" style="gap: 6px">
        <span class="tag">问题方：{{ problemSide === 'A' ? '甲方' : '乙方' }}</span>
        <span class="tag">问题方到场：{{ problemOnsite ? '是' : '否' }}</span>
        <span class="tag">对方到场：{{ otherOnsite ? '是' : '否' }}</span>
        <span class="tag" v-if="match.counterpartDecision">
          对方选择：{{ CHOICE_META[match.counterpartDecision.kind].label }}（{{ match.counterpartDecision.by }}）
        </span>
        <span class="tag amber" v-else>对方尚未选择</span>
        <span class="tag">公益剩余接收能力：{{ charity?.capacity ?? 0 }} 件</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import ItemPhoto from './ItemPhoto.vue'
import { useDataStore } from '../stores/data'
import { CHOICE_META, CONDITION_META, PROBLEM_META, STATUS_META } from '../meta'
import { fmtTime } from '../utils'
import type { Incident } from '../types'

const props = defineProps<{ inc: Incident }>()
const data = useDataStore()

const item = computed(() => data.itemById(props.inc.itemId))
const match = computed(() => (props.inc.matchId ? data.matchById(props.inc.matchId) : undefined))
const sideA = computed(() => (match.value ? data.itemById(match.value.itemAId) : null)!)
const sideB = computed(() => (match.value ? data.itemById(match.value.itemBId) : null)!)
const problemSide = computed(() => (match.value?.problemItemId === sideA.value?.id ? 'A' : 'B'))
const problemOnsite = computed(() => !!item.value?.checkIn?.passed)
const other = computed(() => {
  if (!match.value || !item.value) return null
  return data.itemById(match.value.itemAId === item.value.id ? match.value.itemBId : match.value.itemAId)
})
const otherOnsite = computed(() => !!other.value?.checkIn?.passed)
const charity = computed(() => data.users.find((u) => u.role === 'charity'))

function owner(i: { parentId: string } | null) {
  return i ? data.userById(i.parentId) : undefined
}
</script>

<style scoped>
.problem-block {
  background: #fff7fa;
  border: 1px solid #fbd9e6;
  border-radius: 10px;
  padding: 12px;
}
.match-context {
  border: 1px dashed var(--line);
  border-radius: 10px;
  padding: 12px;
  background: #fffdf9;
}
.side-box {
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 10px 12px;
  background: #fff;
}
.side-box.problem { border-color: var(--rose, #e11d63); background: #fff7fa; }
.red-text { color: var(--red); font-weight: 600; }
</style>
