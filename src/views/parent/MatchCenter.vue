<template>
  <AppShell>
    <h2 class="page-title">撮合中心</h2>
    <p class="page-desc">系统根据孩子年龄段、物品类型、价值区间、双方期望与摊位容量推荐交换组合；对方物品现场出问题时，您可以选择如何处理</p>

    <!-- 资格暂停提示 -->
    <div v-if="blocked" class="notice warn mb16">
      ⚠️ 您的家庭因物品多次现场实物不符被退回，已暂停自动撮合资格：{{ blockReason }}
      新报名物品在完成强化照片复核与缺件说明审核后，资格将自动恢复；现场仍可参与自由交换。
    </div>

    <!-- 冻结 / 回滚中的撮合 -->
    <div v-if="frozenMatches.length" class="card">
      <div class="card-title">🧊 撮合异常处理（{{ frozenMatches.length }}）</div>
      <div v-for="m in frozenMatches" :key="m.id" class="match-row" :class="{ frozen: true }">
        <div class="row wrap">
          <MatchPair :match="m" />
        </div>

        <!-- 我的物品被冻结：等待社区复核，不能自行改写 -->
        <div v-if="frozenSideOf(m) === 'mine'" class="notice error mt12">
          🧊 您的「{{ itemOf(m, 'frozen')?.name }}」在现场被发现
          <b>{{ itemOf(m, 'frozen')?.freezeFlags?.map((f) => PROBLEM_FLAG_META[f].label).join('、') }}</b>，
          物品与关联撮合已冻结。请携带物品到社区复核台，配合比对原始描述、补充缺件说明；
          您无法单方面恢复交换，处理进展可在「争议协调」中查看。
        </div>

        <!-- 对方物品被冻结：由我选择 -->
        <template v-else>
          <div class="notice error mt8">
            对方的「{{ itemOf(m, 'frozen')?.name }}」现场被发现
            <b>{{ itemOf(m, 'frozen')?.freezeFlags?.map((f) => PROBLEM_FLAG_META[f].label).join('、') }}</b>，
            物品与本组合已冻结。请选择处理方式（选择后不可单方面更改，需社区复核执行）：
          </div>

          <!-- 待选择 -->
          <div v-if="m.status === 'frozen' && !m.rollout">
            <div class="rollout-grid mt12">
              <button
                v-for="c in CHOICES"
                :key="c"
                type="button"
                class="rollout-card"
                @click="choiceDraft[m.id] = c"
                :class="{ on: choiceDraft[m.id] === c }"
              >
                <div class="rc-title">{{ ROLLOUT_META[c].icon }} {{ ROLLOUT_META[c].label }}</div>
                <div class="rc-desc">{{ ROLLOUT_META[c].desc }}</div>
              </button>
            </div>
            <input v-model.trim="choiceNotes[m.id]" class="input mt12" placeholder="给社区的补充说明（可选）" />
            <div class="row mt12" style="justify-content: flex-end">
              <button class="btn primary" :disabled="!choiceDraft[m.id]" @click="submitChoice(m)">确认选择</button>
            </div>
          </div>

          <!-- 已选择 -->
          <div v-else class="notice info mt12">
            您已选择【{{ m.rollout ? ROLLOUT_META[m.rollout.choice].label : '' }}】
            <template v-if="m.status === 'waiting_replace'">，社区正在为您协调同类替代物品，您的到场登记已保留，也可直接到自由交换区现场交换。</template>
            <template v-else-if="m.rollout?.choice === 'continue'">，等待社区现场复核放行（原摊位与时段保留）。</template>
            <template v-else-if="m.rollout?.choice === 'free_exchange'">，请携带物品到自由交换区现场另寻交换。</template>
            <template v-else-if="m.rollout?.choice === 'cancel'">，预约已取消，按您的到场情况已分别保留登记或释放时段。</template>
          </div>
        </template>
      </div>
    </div>

    <!-- 已完成的回滚处理（保留结果可见） -->
    <div v-if="rolledOutMatches.length" class="card">
      <div class="card-title">🗂️ 异常交换处理结果（{{ rolledOutMatches.length }}）</div>
      <div v-for="m in rolledOutMatches" :key="m.id" class="match-row">
        <MatchPair :match="m" />
        <div class="notice mt12" :class="m.rollout?.choice === 'continue' ? 'success' : 'info'">
          该组合已处理：您选择了【{{ m.rollout ? ROLLOUT_META[m.rollout.choice].label : '' }}】
          <template v-if="m.rollout?.choice === 'cancel'">，预约已按到场情况分别释放或保留。</template>
          <template v-else-if="m.rollout?.choice === 'free_exchange'">，物品已进入自由交换区。</template>
          <template v-else-if="m.rollout?.choice === 'wait_replace'">，等待替代协调结果可在「争议协调」查看。</template>
          <template v-else-if="m.rollout?.choice === 'continue'">，社区已复核放行，交换完成。</template>
        </div>
      </div>
    </div>

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
          <div v-if="blocked" class="notice warn mt8">
            该物品在自动撮合资格暂停期内，不会进入一键智能撮合，也不能主动发起撮合；完成强化复核后恢复。
          </div>
          <div v-else-if="recs(item).length" class="mt8">
            <div v-for="r in recs(item)" :key="r.item.id" class="rec-row">
              <div class="score-ring" :style="{ '--p': r.score }"><span>{{ r.score }}</span></div>
              <div style="flex: 1; min-width: 0">
                <div style="font-weight: 600">
                  {{ CATEGORY_META[r.item.category].icon }} {{ r.item.name }}
                  <span class="small muted">（{{ ownerOf(r.item)?.name }} · {{ CONDITION_META[r.item.condition] }} · {{ fmtValue(r.item.valueRange) }}）</span>
                  <span v-if="data.familyAutoMatchBlocked(r.item.parentId)" class="badge amber" title="该家庭处于强化复核期">强化复核期</span>
                </div>
                <div class="tag-list mt8">
                  <span v-for="(reason, i) in r.reasons" :key="i" class="tag">{{ reason }}</span>
                </div>
              </div>
              <button
                class="btn sm primary"
                :disabled="data.familyAutoMatchBlocked(r.item.parentId)"
                @click="propose(item, r.item)"
              >发起撮合</button>
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
  </AppShell>
</template>

<script setup lang="ts">
import { computed, h, reactive } from 'vue'
import AppShell from '../../components/AppShell.vue'
import ItemPhoto from '../../components/ItemPhoto.vue'
import EmptyState from '../../components/EmptyState.vue'
import { useAuthStore } from '../../stores/auth'
import { useDataStore } from '../../stores/data'
import { CATEGORY_META, CONDITION_META, PROBLEM_FLAG_META, ROLLOUT_META } from '../../meta'
import { fmtValue } from '../../utils'
import type { Item, Match, RolloutChoice } from '../../types'

const auth = useAuthStore()
const data = useDataStore()
const myId = auth.currentUser!.id

const CHOICES: RolloutChoice[] = ['continue', 'free_exchange', 'wait_replace', 'cancel']
const choiceDraft = reactive<Record<string, RolloutChoice | ''>>({})
const choiceNotes = reactive<Record<string, string>>({})

const myItems = computed(() => data.itemsByParent(myId))
const myApproved = computed(() => myItems.value.filter((i) => i.status === 'approved'))
const blocked = computed(() => data.familyAutoMatchBlocked(myId))
const blockReason = computed(() => data.userById(myId)?.autoMatchBlockReason ?? '')

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
const frozenMatches = computed(() =>
  myMatches.value.filter((m) => m.status === 'frozen' || m.status === 'waiting_replace'),
)
/** 已做出回滚选择并结束的冻结组合（保留结果可见，避免家长看不到处理去向） */
const rolledOutMatches = computed(() =>
  myMatches.value.filter(
    (m) => m.frozenItemId && m.rollout && ['cancelled', 'failed', 'completed'].includes(m.status),
  ),
)

function itemOf(m: Match, which: 'a' | 'b' | 'frozen' = 'a'): Item | undefined {
  if (which === 'frozen') {
    const fid = m.frozenItemId ?? (data.itemById(m.itemAId)?.status === 'frozen' ? m.itemAId : m.itemBId)
    return data.itemById(fid)
  }
  return data.itemById(which === 'a' ? m.itemAId : m.itemBId)
}
/** 该冻结组合中，被冻结的是不是"我"的物品 */
function frozenSideOf(m: Match): 'mine' | 'theirs' {
  const frozen = itemOf(m, 'frozen')
  return frozen?.parentId === myId ? 'mine' : 'theirs'
}

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
  } else {
    alert('发起失败：对方家庭可能处于强化复核期，暂不参与撮合')
  }
}
function submitChoice(m: Match) {
  const choice = choiceDraft[m.id]
  if (!choice) return
  const res = data.chooseRollout(m.id, myId, choice, auth.currentUser!.name, choiceNotes[m.id]?.trim() || undefined)
  if (res.ok) alert(`已确认选择【${ROLLOUT_META[choice].label}】，社区将据此处理摊位、时段与凭证`)
  else alert(res.error ?? '选择失败')
}

/** 撮合组合展示（本地小组件） */
const MatchPair = (props: { match: Match }) => {
  const a = data.itemById(props.match.itemAId)!
  const b = data.itemById(props.match.itemBId)!
  const side = (item: Item, label: string, isFrozen: boolean) =>
    h('div', { style: 'flex:1;display:flex;gap:10px;align-items:center;min-width:0' }, [
      h(ItemPhoto, { photo: item.photos[0], category: item.category }),
      h('div', { style: 'min-width:0' }, [
        h('div', { class: 'small muted' }, [label, isFrozen ? h('span', { class: 'badge red', style: 'margin-left:6px' }, '已冻结') : null]),
        h('div', { style: 'font-weight:700' }, `${CATEGORY_META[item.category].icon} ${item.name}`),
        h('div', { class: 'small muted' }, `${data.userById(item.parentId)?.name} · ${fmtValue(item.valueRange)}`),
      ]),
    ])
  const frozenId = props.match.frozenItemId
  return h('div', [
    h('div', { style: 'display:flex;align-items:center;gap:10px;flex-wrap:wrap' }, [
      side(a, a.parentId === myId ? '我的物品' : '对方物品', frozenId === a.id),
      h('div', { style: 'text-align:center;flex-shrink:0' }, [
        h('div', { style: 'font-size:20px' }, '🔄'),
        h('div', { class: 'badge orange' }, `匹配 ${props.match.score} 分`),
      ]),
      side(b, b.parentId === myId ? '我的物品' : '对方物品', frozenId === b.id),
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
.match-row.frozen {
  border-color: #f2c6c6;
  background: #fff7f7;
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
.rollout-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
.rollout-card {
  text-align: left;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: #fff;
  padding: 12px 14px;
  cursor: pointer;
  transition: all 0.12s;
}
.rollout-card:hover { border-color: var(--primary); }
.rollout-card.on {
  border-color: var(--primary);
  background: var(--primary-soft);
  box-shadow: 0 0 0 2px var(--primary-soft);
}
.rc-title { font-weight: 700; font-size: 14px; margin-bottom: 4px; }
.rc-desc { font-size: 12.5px; color: var(--ink-2); line-height: 1.5; }
</style>
