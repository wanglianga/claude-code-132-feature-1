<template>
  <AppShell>
    <h2 class="page-title">撮合中心</h2>
    <p class="page-desc">系统根据孩子年龄段、物品类型、价值区间、双方期望与摊位容量推荐交换组合，双方确认后即预约成功</p>

    <!-- 待确认的撮合 -->
    <div class="card">
      <div class="card-title">📬 待确认的撮合（{{ pendingMatches.length }}）</div>
      <template v-if="pendingMatches.length">
        <div v-for="m in pendingMatches" :key="m.id" class="match-row">
          <MatchPair :match="m" />
          <div class="row mt8" style="justify-content: flex-end">
            <template v-if="!iAccepted(m)">
              <button class="btn sm primary" @click="respond(m, true)">✅ 接受撮合</button>
              <button class="btn sm danger" @click="respond(m, false)">✖️ 拒绝</button>
            </template>
            <span v-else class="badge indigo">已接受，等待对方确认</span>
          </div>
        </div>
      </template>
      <EmptyState v-else icon="📭" text="暂无待确认的撮合" />
    </div>

    <!-- 我的待撮合物品与推荐 -->
    <div class="card">
      <div class="card-title">💡 智能推荐（我的待撮合物品）</div>
      <template v-if="myApproved.length">
        <div v-for="item in myApproved" :key="item.id" class="mb16">
          <div class="row">
            <ItemPhoto :photo="item.photos[0]" :category="item.category" />
            <div>
              <div style="font-weight: 700">{{ item.name }}</div>
              <div class="small muted">期望换取：{{ desiredText(item) }} · 价值 {{ fmtValue(item.valueRange) }}</div>
            </div>
          </div>
          <div v-if="recs(item).length" class="mt8">
            <div v-for="r in recs(item)" :key="r.item.id" class="rec-row">
              <div class="score-ring" :style="{ '--p': r.score }"><span>{{ r.score }}</span></div>
              <div style="flex: 1; min-width: 0">
                <div style="font-weight: 600">
                  {{ CATEGORY_META[r.item.category].icon }} {{ r.item.name }}
                  <span class="small muted">（{{ ownerOf(r.item)?.name }} · {{ CONDITION_META[r.item.condition] }} · {{ fmtValue(r.item.valueRange) }}）</span>
                </div>
                <div class="tag-list mt8">
                  <span v-for="(reason, i) in r.reasons" :key="i" class="tag">{{ reason }}</span>
                </div>
              </div>
              <button class="btn sm primary" @click="propose(item, r.item)">发起撮合</button>
            </div>
          </div>
          <p v-else class="small muted mt8">暂无合适推荐，可等待社区发起智能撮合，或进入自由交换区</p>
          <div class="divider" />
        </div>
      </template>
      <EmptyState v-else icon="🎯" text="没有待撮合的物品（审核通过的物品会出现在这里）" />
    </div>

    <!-- 已预约 -->
    <div class="card">
      <div class="card-title">🎫 已预约的交换（{{ confirmedMatches.length }}）</div>
      <template v-if="confirmedMatches.length">
        <div v-for="m in confirmedMatches" :key="m.id" class="match-row">
          <MatchPair :match="m" />
          <div class="notice success mt8">
            预约成功：摊位 <b>{{ m.booth }}</b> · 入场时段 <b>{{ m.entryTime }}</b>，请准时到场并在「我的物品」中出示入场凭证
          </div>
        </div>
      </template>
      <EmptyState v-else icon="🎫" text="暂无已预约的交换" />
    </div>

    <!-- 冻结中的交换 -->
    <div v-if="frozenMatches.length" class="card" style="border-color: var(--rose, #e11d63)">
      <div class="card-title">🧊 冻结中的交换（{{ frozenMatches.length }}）</div>
      <div v-for="m in frozenMatches" :key="m.id" class="match-row" style="background: #fff7fa">
        <MatchPair :match="m" />
        <div class="notice error mt8">
          对方物品被现场标记实物问题，撮合与取物凭证已冻结。请前往「争议协调」页查看问题照片/缺件说明并选择处置方式
          （继续交换 / 改为自由交换 / 等待替代物品 / 取消），最终由社区依据现场复核执行。
        </div>
        <div class="row" style="justify-content: flex-end">
          <router-link to="/parent/incidents" class="btn sm danger">前往争议协调</router-link>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, h } from 'vue'
import AppShell from '../../components/AppShell.vue'
import ItemPhoto from '../../components/ItemPhoto.vue'
import EmptyState from '../../components/EmptyState.vue'
import { useAuthStore } from '../../stores/auth'
import { useDataStore } from '../../stores/data'
import { CATEGORY_META, CONDITION_META } from '../../meta'
import { fmtValue } from '../../utils'
import type { Item, Match } from '../../types'

const auth = useAuthStore()
const data = useDataStore()
const myId = auth.currentUser!.id

const myItems = computed(() => data.itemsByParent(myId))
const myApproved = computed(() => myItems.value.filter((i) => i.status === 'approved'))

const myMatches = computed(() =>
  data.matches.filter((m) => {
    const a = data.itemById(m.itemAId)
    const b = data.itemById(m.itemBId)
    return a?.parentId === myId || b?.parentId === myId
  }),
)
const pendingMatches = computed(() =>
  myMatches.value.filter((m) => ['proposed', 'accepted_a', 'accepted_b'].includes(m.status)),
)
const confirmedMatches = computed(() => myMatches.value.filter((m) => m.status === 'confirmed'))
const frozenMatches = computed(() => myMatches.value.filter((m) => m.status === 'frozen'))

function ownerOf(item: Item) {
  return data.userById(item.parentId)
}
function desiredText(item: Item) {
  return item.desiredCategories.length
    ? item.desiredCategories.map((c) => CATEGORY_META[c].label).join('、')
    : '不限'
}
function recs(item: Item) {
  return data.recommendationsFor(item.id)
}
function iAccepted(m: Match): boolean {
  const a = data.itemById(m.itemAId)
  if (m.status === 'accepted_a') return a?.parentId === myId
  if (m.status === 'accepted_b') return a?.parentId !== myId
  return false
}
function respond(m: Match, accept: boolean) {
  data.respondMatch(m.id, myId, accept, auth.currentUser!.name)
}
function propose(item: Item, target: Item) {
  if (data.proposeFromRecommendation(item.id, target.id, auth.currentUser!.name)) {
    alert(`已向「${target.name}」发起撮合，等待双方确认`)
  }
}

/** 撮合组合展示（本地小组件） */
const MatchPair = (props: { match: Match }) => {
  const a = data.itemById(props.match.itemAId)!
  const b = data.itemById(props.match.itemBId)!
  const side = (item: Item, label: string) =>
    h('div', { style: 'flex:1;display:flex;gap:10px;align-items:center;min-width:0' }, [
      h(ItemPhoto, { photo: item.photos[0], category: item.category }),
      h('div', { style: 'min-width:0' }, [
        h('div', { class: 'small muted' }, label),
        h('div', { style: 'font-weight:700' }, `${CATEGORY_META[item.category].icon} ${item.name}`),
        h('div', { class: 'small muted' }, `${data.userById(item.parentId)?.name} · ${fmtValue(item.valueRange)}`),
      ]),
    ])
  return h('div', [
    h('div', { style: 'display:flex;align-items:center;gap:10px;flex-wrap:wrap' }, [
      side(a, a.parentId === myId ? '我的物品' : '对方物品'),
      h('div', { style: 'text-align:center;flex-shrink:0' }, [
        h('div', { style: 'font-size:20px' }, '🔄'),
        h('div', { class: 'badge orange' }, `匹配 ${props.match.score} 分`),
      ]),
      side(b, b.parentId === myId ? '我的物品' : '对方物品'),
    ]),
    h(
      'div',
      { class: 'tag-list mt8' },
      props.match.reasons.map((r) => h('span', { class: 'tag' }, r)),
    ),
  ])
}
MatchPair.props = ['match']
</script>

<style scoped>
.match-row {
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 12px;
  background: #fffdf9;
}
.rec-row {
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px dashed var(--line);
  border-radius: 12px;
  padding: 10px 12px;
  margin-bottom: 8px;
}
</style>
