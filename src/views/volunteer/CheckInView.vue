<template>
  <AppShell>
    <h2 class="page-title">扫码核销台</h2>
    <p class="page-desc">扫码确认物品到场；发现缺件、与照片差异大或消毒无法确认时拍照标记，物品与关联撮合立即冻结</p>

    <div class="grid" style="grid-template-columns: 1fr 1fr; align-items: start">
      <!-- 核销操作 -->
      <div class="card">
        <div class="card-title">📷 扫码核销 / 问题标记</div>
        <div class="row">
          <input
            v-model.trim="code"
            class="input"
            placeholder="输入核销码，如 SW-1011"
            @keyup.enter="lookup"
          />
          <button class="btn primary" @click="lookup">核销</button>
        </div>
        <div v-if="lookupError" class="notice error mt12">{{ lookupError }}</div>

        <template v-if="current">
          <div class="divider" />
          <div class="row" style="align-items: flex-start">
            <ItemPhoto :photo="current.photos[0]" :category="current.category" lg />
            <div style="flex: 1">
              <div class="item-name">
                {{ current.name }}
                <StatusBadge :status="current.status" />
              </div>
              <div class="item-meta">
                <span>{{ current.code }}</span>
                <span>家长 {{ owner?.name }} {{ owner?.phone }}</span>
                <span v-if="current.booth">摊位 {{ current.booth }}</span>
              </div>
              <div class="tag-list mt8">
                <span class="tag">{{ CONDITION_META[current.condition] }}</span>
                <span class="tag">{{ current.disinfected ? '家长申报已消毒' : '家长申报未消毒' }}</span>
                <span v-if="current.note" class="tag">原始描述：{{ current.note }}</span>
              </div>
            </div>
          </div>

          <!-- 冻结状态展示 -->
          <template v-if="current.status === 'frozen'">
            <div class="notice error mt12">
              🧊 该物品已被现场冻结：{{ current.freezeFlags?.map((f) => PROBLEM_FLAG_META[f].label).join('、') }}
              <div class="small mt8">已通知原撮合对象选择处理方式，并由社区工作人员在「异常处置」中现场复核，志愿者不可重复核销。</div>
            </div>
            <div v-if="current.checkIn?.missingPartsNote" class="notice warn mt8">
              缺件说明：{{ current.checkIn.missingPartsNote }}
            </div>
            <div v-if="current.issuePhotos?.length" class="row wrap mt12">
              <ItemPhoto v-for="(p, i) in current.issuePhotos" :key="i" :photo="p" :category="current.category" />
            </div>
          </template>

          <template v-else-if="canCheckIn">
            <div class="divider" />
            <div class="field">
              <label class="check-line">
                <input v-model="form.photoMatch" type="checkbox" />
                实物与报名照片一致
              </label>
            </div>
            <div class="field">
              <label>破损情况</label>
              <div class="chip-row">
                <button class="chip" :class="{ on: form.damage === 'none' }" @click="form.damage = 'none'">✅ 无破损</button>
                <button class="chip" :class="{ on: form.damage === 'minor' }" @click="form.damage = 'minor'">⚠️ 轻微破损（可继续）</button>
                <button class="chip" :class="{ on: form.damage === 'severe' }" @click="form.damage = 'severe'">❌ 严重破损（终止）</button>
              </div>
            </div>
            <div class="field">
              <label class="check-line">
                <input v-model="form.disinfected" type="checkbox" />
                已确认完成消毒
              </label>
            </div>

            <div class="divider" />
            <div class="field">
              <label>🧊 现场实物问题（勾选任一问题将拍照标记并冻结物品及关联撮合）</label>
              <div class="chip-row">
                <button
                  v-for="f in PROBLEM_FLAGS"
                  :key="f"
                  type="button"
                  class="chip"
                  :class="{ 'warn on': form.flags.includes(f) }"
                  @click="toggleFlag(f)"
                >
                  {{ PROBLEM_FLAG_META[f].icon }} {{ PROBLEM_FLAG_META[f].label }}
                </button>
              </div>
            </div>
            <div v-if="form.flags.includes('missing_parts')" class="field">
              <label>缺件说明<span class="req">*</span></label>
              <input v-model.trim="form.missingPartsNote" class="input" placeholder="如：缺少 2 节直轨与充电线……" />
            </div>
            <div class="field">
              <label>📸 现场问题照片（{{ form.issuePhotos.length }}/3，将作为社区复核依据）</label>
              <div class="row wrap">
                <div v-for="(p, i) in form.issuePhotos" :key="i" style="position: relative">
                  <ItemPhoto :photo="p" :category="current.category" />
                  <button
                    type="button"
                    class="modal-close"
                    style="position: absolute; top: -6px; right: -6px; width: 20px; height: 20px; font-size: 10px"
                    @click="form.issuePhotos.splice(i, 1)"
                  >✕</button>
                </div>
                <label v-if="form.issuePhotos.length < 3" class="item-photo" style="cursor: pointer; font-size: 24px; color: var(--ink-3)">
                  ＋
                  <input type="file" accept="image/*" capture="environment" style="display: none" @change="onIssuePhoto" />
                </label>
              </div>
            </div>
            <div class="field">
              <label>现场备注</label>
              <input v-model.trim="form.note" class="input" placeholder="如：实物颜色略浅、外包装有拆封痕迹……" />
            </div>

            <div v-if="willFreeze" class="notice error mb12">
              🧊 提交后将<b>冻结该物品及其关联撮合</b>，原摊位在复核期间保留，对方家长需在继续交换 / 自由交换 / 等待替代 / 取消之间选择
            </div>
            <div v-else-if="!willPass" class="notice warn mb12">
              当前核验结果不通过且未标记具体实物问题，提交后转入一般异常处理流程
            </div>
            <button class="btn lg block" :class="willFreeze ? 'danger' : willPass ? 'primary' : 'outline'" @click="submitCheckIn">
              {{ willFreeze ? '🧊 拍照标记问题并冻结' : willPass ? '✅ 核验通过，完成核销' : '⚠️ 提交核验（转入异常处理）' }}
            </button>
          </template>
          <div v-else-if="current.checkIn" class="notice info mt12">
            该物品已于 {{ fmtTime(current.checkIn.at) }} 由 {{ current.checkIn.by }} 核销（{{ current.checkIn.passed ? '通过' : '存疑' }}）
          </div>
          <div v-else class="notice warn mt12">
            该物品当前状态为「{{ STATUS_META[current.status].label }}」，不在可核销范围（需为已预约 / 自由交换区物品）
          </div>
        </template>
      </div>

      <!-- 现场动态 -->
      <div>
        <div class="card">
          <div class="card-title">🧊 冻结待处理（{{ frozenMatches.length }}）</div>
          <template v-if="frozenMatches.length">
            <div v-for="m in frozenMatches" :key="m.id" class="queue-row">
              <div style="flex: 1">
                <b>{{ problemItem(m)?.name }}</b>
                <span class="small muted">（{{ problemItem(m)?.code }}）</span>
                <div class="small" style="color: var(--red)">
                  {{ problemItem(m)?.freezeFlags?.map((f) => PROBLEM_FLAG_META[f].label).join('、') }}
                </div>
                <div class="small muted">
                  对方：{{ counterpartItem(m)?.name }} · {{ data.userById(counterpartItem(m)!.parentId)?.name }}
                  → {{ m.rollout ? ROLLOUT_META[m.rollout.choice].label : '待对方选择' }}
                </div>
              </div>
              <span class="badge" :class="m.rollout ? 'amber' : 'red'">{{ m.rollout ? '已选择' : '待选择' }}</span>
            </div>
          </template>
          <EmptyState v-else icon="🧊" text="暂无冻结组合" />
        </div>

        <div class="card">
          <div class="card-title">⏰ 待到场（{{ data.reservedItems.length }}）</div>
          <template v-if="data.reservedItems.length">
            <div v-for="item in data.reservedItems" :key="item.id" class="queue-row">
              <div style="flex: 1">
                <b>{{ item.name }}</b> <span class="small muted">{{ item.code }} · {{ data.userById(item.parentId)?.name }} · {{ item.entryTime }}</span>
              </div>
              <button class="btn sm outline" @click="fillCode(item.code)">核销</button>
              <button class="btn sm danger" @click="noShow(item.id)">缺席</button>
            </div>
          </template>
          <EmptyState v-else icon="✅" text="无待到场物品" />
        </div>

        <div class="card">
          <div class="card-title">🤝 可成交组合（{{ readyMatches.length }}）</div>
          <template v-if="readyMatches.length">
            <div v-for="m in readyMatches" :key="m.id" class="queue-row">
              <div style="flex: 1">
                <b>{{ data.itemById(m.itemAId)?.name }}</b> 🔄 <b>{{ data.itemById(m.itemBId)?.name }}</b>
                <span class="small muted"> · 摊位 {{ m.booth }}</span>
              </div>
              <button class="btn sm success" @click="complete(m.id)">确认交换完成</button>
            </div>
          </template>
          <EmptyState v-else icon="🤝" text="暂无双方均核销通过的预约组合" />
        </div>

        <div class="card">
          <div class="card-title">🛟 上报现场异常</div>
          <div class="field">
            <label>关联物品</label>
            <select v-model="incItemId" class="select">
              <option value="">选择物品……</option>
              <option v-for="i in incidentCandidates" :key="i.id" :value="i.id">{{ i.name }}（{{ i.code }} · {{ STATUS_META[i.status].label }}）</option>
            </select>
          </div>
          <div class="field">
            <label>异常类型</label>
            <div class="chip-row">
              <button
                v-for="t in incidentTypes"
                :key="t"
                class="chip"
                :class="{ on: incType === t }"
                @click="incType = t"
              >
                {{ INCIDENT_META[t].icon }} {{ INCIDENT_META[t].label }}
              </button>
            </div>
          </div>
          <div class="field">
            <input v-model.trim="incMessage" class="input" placeholder="情况说明……" />
          </div>
          <button class="btn danger block" @click="report">上报异常</button>
        </div>

        <div class="card">
          <div class="card-title">✅ 已核销（{{ checkedInItems.length }}）</div>
          <div v-for="item in checkedInItems" :key="item.id" class="queue-row">
            <div style="flex: 1">
              <b>{{ item.name }}</b> <span class="small muted">{{ item.code }}</span>
            </div>
            <StatusBadge :status="item.status" />
          </div>
          <EmptyState v-if="!checkedInItems.length" icon="📷" text="暂无核销记录" />
        </div>
      </div>
    </div>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import AppShell from '../../components/AppShell.vue'
import ItemPhoto from '../../components/ItemPhoto.vue'
import StatusBadge from '../../components/StatusBadge.vue'
import EmptyState from '../../components/EmptyState.vue'
import { useAuthStore } from '../../stores/auth'
import { useDataStore } from '../../stores/data'
import { CONDITION_META, INCIDENT_META, PROBLEM_FLAG_META, ROLLOUT_META, STATUS_META } from '../../meta'
import { fileToDataUrl, fmtTime } from '../../utils'
import type { IncidentType, Item, Match, ProblemFlag } from '../../types'

const auth = useAuthStore()
const data = useDataStore()

const code = ref('')
const current = ref<Item | null>(null)
const lookupError = ref('')

const PROBLEM_FLAGS: ProblemFlag[] = ['missing_parts', 'photo_mismatch', 'disinfection_unconfirmed']

const form = reactive({
  photoMatch: true,
  damage: 'none' as 'none' | 'minor' | 'severe',
  disinfected: true,
  flags: [] as ProblemFlag[],
  missingPartsNote: '',
  issuePhotos: [] as string[],
  note: '',
})

const owner = computed(() => (current.value ? data.userById(current.value.parentId) : null))
const canCheckIn = computed(
  () => current.value && ['reserved', 'free_zone', 'matched', 'arrived'].includes(current.value.status) && !current.value.checkIn,
)
const willPass = computed(() => form.photoMatch && form.disinfected && form.damage !== 'severe' && form.flags.length === 0)
const willFreeze = computed(() => form.flags.length > 0)

const readyMatches = computed(() => data.matches.filter((m) => data.canConfirmExchange(m)))
const frozenMatches = computed(() => data.matches.filter((m) => m.status === 'frozen' || m.status === 'waiting_replace'))
const checkedInItems = computed(() => data.items.filter((i) => i.checkIn))
const incidentCandidates = computed(() =>
  data.items.filter((i) => ['reserved', 'arrived', 'verified', 'free_zone', 'no_exchange', 'frozen'].includes(i.status)),
)
// 实物不符（缺件/照片差异/消毒无法确认）必须走上方「勾选问题→拍照冻结」流程，
// 手动上报仅保留一般照片存疑等类型，避免产生无法走复核面板的事件
const incidentTypes: IncidentType[] = ['no_show', 'photo_mismatch', 'child_regret', 'value_dispute']

const incItemId = ref('')
const incType = ref<IncidentType>('child_regret')
const incMessage = ref('')

function lookup() {
  lookupError.value = ''
  const item = data.itemByCode(code.value)
  if (!item) {
    lookupError.value = `未找到核销码「${code.value}」对应的物品，请核对后重试`
    current.value = null
    return
  }
  current.value = item
  form.photoMatch = true
  form.damage = 'none'
  form.disinfected = item.disinfected
  form.flags = []
  form.missingPartsNote = ''
  form.issuePhotos = []
  form.note = ''
}

function fillCode(c: string) {
  code.value = c
  lookup()
}

function toggleFlag(f: ProblemFlag) {
  const i = form.flags.indexOf(f)
  if (i >= 0) form.flags.splice(i, 1)
  else form.flags.push(f)
}

function onIssuePhoto(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  fileToDataUrl(file).then((url) => {
    if (form.issuePhotos.length < 3) form.issuePhotos.push(url)
  })
  ;(e.target as HTMLInputElement).value = ''
}

function submitCheckIn() {
  if (!current.value) return
  if (willFreeze.value && form.flags.includes('missing_parts') && !form.missingPartsNote) {
    alert('标记「缺少关键零件」时必须填写缺件说明')
    return
  }
  data.checkIn(
    current.value.id,
    {
      by: auth.currentUser!.name,
      photoMatch: form.photoMatch,
      damage: form.damage,
      disinfectedConfirmed: form.disinfected,
      note: form.note || undefined,
      passed: willPass.value,
      flags: [...form.flags],
      issuePhotos: [...form.issuePhotos],
      missingPartsNote: form.missingPartsNote || undefined,
    },
    auth.currentUser!.name,
  )
  code.value = ''
  current.value = null
}

function problemItem(m: Match) {
  return data.itemById(m.frozenItemId ?? '') ?? data.frozenItems.find((i) => i.id === m.itemAId || i.id === m.itemBId)
}
function counterpartItem(m: Match) {
  const p = problemItem(m)
  return data.itemById(p?.id === m.itemAId ? m.itemBId : m.itemAId)
}

function noShow(itemId: string) {
  if (confirm('确认该家长临时缺席？将生成缺席异常')) {
    data.markNoShow(itemId, auth.currentUser!.name)
  }
}

function complete(matchId: string) {
  data.confirmExchange(matchId, auth.currentUser!.name)
}

function report() {
  const item = data.itemById(incItemId.value)
  if (!item) return alert('请选择关联物品')
  if (!incMessage.value) return alert('请填写情况说明')
  if (incType.value === 'no_show') {
    data.markNoShow(item.id, auth.currentUser!.name)
  } else {
    const match = data.activeMatchForItem(item.id)
    data.reportIncident({
      itemId: item.id,
      matchId: match && ['confirmed', 'frozen'].includes(match.status) ? match.id : undefined,
      type: incType.value,
      title: `「${item.name}」${INCIDENT_META[incType.value].label}`,
      message: incMessage.value,
      by: auth.currentUser!.name,
      role: 'volunteer',
    })
  }
  incItemId.value = ''
  incMessage.value = ''
  alert('已上报，社区工作人员将在异常处置台跟进')
}
</script>

<style scoped>
.queue-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid #f5eee6;
}
.queue-row:last-child { border-bottom: none; }
</style>
