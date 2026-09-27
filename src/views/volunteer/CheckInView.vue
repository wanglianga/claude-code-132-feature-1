<template>
  <AppShell>
    <h2 class="page-title">扫码核销台</h2>
    <p class="page-desc">扫描或输入物品核销码，确认物品到场、照片与实物一致、破损情况与消毒情况</p>

    <div class="grid" style="grid-template-columns: 1fr 1fr; align-items: start">
      <!-- 核销操作 -->
      <div class="card">
        <div class="card-title">📷 扫码核销</div>
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
              </div>
            </div>
          </div>

          <template v-if="canCheckIn">
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
            <div class="field">
              <label>现场备注</label>
              <input v-model.trim="form.note" class="input" placeholder="如：实物颜色略浅、缺少配件……" />
            </div>
            <div v-if="!willPass" class="notice warn mb12">
              当前核验结果不通过，提交后物品将转入异常处理流程
            </div>
            <button class="btn primary lg block" @click="submitCheckIn">
              {{ willPass ? '✅ 核验通过，完成核销' : '⚠️ 提交核验（转入异常处理）' }}
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
import { CONDITION_META, INCIDENT_META, STATUS_META } from '../../meta'
import { fmtTime } from '../../utils'
import type { IncidentType, Item } from '../../types'

const auth = useAuthStore()
const data = useDataStore()

const code = ref('')
const current = ref<Item | null>(null)
const lookupError = ref('')

const form = reactive({
  photoMatch: true,
  damage: 'none' as 'none' | 'minor' | 'severe',
  disinfected: true,
  note: '',
})

const owner = computed(() => (current.value ? data.userById(current.value.parentId) : null))
const canCheckIn = computed(
  () => current.value && ['reserved', 'free_zone', 'matched'].includes(current.value.status) && !current.value.checkIn,
)
const willPass = computed(() => form.photoMatch && form.disinfected && form.damage !== 'severe')

const readyMatches = computed(() =>
  data.matches.filter(
    (m) =>
      m.status === 'confirmed' &&
      data.itemById(m.itemAId)?.status === 'verified' &&
      data.itemById(m.itemBId)?.status === 'verified',
  ),
)
const checkedInItems = computed(() => data.items.filter((i) => i.checkIn))
const incidentCandidates = computed(() =>
  data.items.filter((i) => ['reserved', 'arrived', 'verified', 'free_zone', 'no_exchange'].includes(i.status)),
)
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
  form.note = ''
}

function fillCode(c: string) {
  code.value = c
  lookup()
}

function submitCheckIn() {
  if (!current.value) return
  data.checkIn(
    current.value.id,
    {
      by: auth.currentUser!.name,
      photoMatch: form.photoMatch,
      damage: form.damage,
      disinfectedConfirmed: form.disinfected,
      note: form.note || undefined,
      passed: willPass.value,
    },
    auth.currentUser!.name,
  )
  code.value = ''
  current.value = null
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
      matchId: match?.status === 'confirmed' ? match.id : undefined,
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
