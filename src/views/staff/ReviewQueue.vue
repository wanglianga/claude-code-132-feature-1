<template>
  <AppShell>
    <h2 class="page-title">物品审核</h2>
    <p class="page-desc">玩具、绘本、衣物、学习用品、婴童用品可进入交换；危险品、食品、药品、隐私物品需驳回并说明原因</p>

    <PhaseBar />

    <div class="card mt16">
      <div class="card-title">⏳ 待审核（{{ data.pendingItems.length }}）</div>
      <template v-if="data.pendingItems.length">
        <div v-for="item in data.pendingItems" :key="item.id" class="review-row">
          <div v-if="data.needsEnhancedReview(item)" class="notice warn" style="margin-bottom: 10px">
            🧾 该家庭此前有物品多次被现场退回，本件须走<b>强化照片复核与缺件说明</b>流程：核对多角度实拍、零件清单与报名描述一致后才可通过；该家庭暂不参与自动撮合。
          </div>
          <ItemCard :item="item" show-owner>
            <template #actions>
              <button v-if="data.needsEnhancedReview(item)" class="btn sm primary" @click="openEnhanced(item)">🧾 强化复核</button>
              <template v-else>
                <button class="btn sm success" @click="approve(item)">✅ 通过</button>
                <button class="btn sm danger" @click="openReject(item)">🚫 驳回</button>
              </template>
              <button class="btn sm outline" @click="detail = item">📋 详情</button>
            </template>
          </ItemCard>
          <div v-if="!CATEGORY_META[item.category].allowed" class="notice error" style="margin-top: -6px; margin-bottom: 12px">
            ⚠️ 该物品属于「{{ CATEGORY_META[item.category].label }}」，按活动规则应驳回
          </div>
        </div>
      </template>
      <EmptyState v-else icon="✅" text="没有待审核的物品" />
    </div>

    <div class="card">
      <div class="card-title">🗂️ 已审核记录</div>
      <table class="table" v-if="reviewed.length">
        <thead>
          <tr><th>物品</th><th>家长</th><th>品类</th><th>结果</th><th>原因</th><th>审核人</th><th>时间</th></tr>
        </thead>
        <tbody>
          <tr v-for="item in reviewed" :key="item.id">
            <td>{{ CATEGORY_META[item.category].icon }} {{ item.name }}</td>
            <td>{{ data.userById(item.parentId)?.name }}</td>
            <td>{{ CATEGORY_META[item.category].label }}</td>
            <td><StatusBadge :status="item.status === 'rejected' ? 'rejected' : 'approved'" /></td>
            <td class="small muted">{{ item.review?.reason ?? '—' }}</td>
            <td>{{ item.review?.by }}</td>
            <td class="small muted">{{ item.review ? fmtTime(item.review.at) : '' }}</td>
          </tr>
        </tbody>
      </table>
      <EmptyState v-else icon="🗂️" text="暂无审核记录" />
    </div>

    <!-- 驳回弹窗 -->
    <div v-if="rejecting" class="modal-mask" @click.self="rejecting = null">
      <div class="modal" style="width: 460px">
        <div class="modal-head">
          <h3>🚫 驳回「{{ rejecting.name }}」</h3>
          <button class="modal-close" @click="rejecting = null">✕</button>
        </div>
        <div class="field">
          <label>驳回原因<span class="req">*</span></label>
          <div class="chip-row">
            <button
              v-for="r in REJECT_REASONS"
              :key="r"
              class="chip"
              :class="{ on: rejectReason === r }"
              @click="rejectReason = r"
            >
              {{ r }}
            </button>
          </div>
        </div>
        <div class="field">
          <label>补充说明</label>
          <textarea v-model.trim="rejectNote" class="textarea" placeholder="向家长说明具体情况……" />
        </div>
        <div class="row">
          <button class="btn danger" @click="confirmReject">确认驳回</button>
          <button class="btn ghost" @click="rejecting = null">取消</button>
        </div>
      </div>
    </div>

    <!-- 强化照片复核弹窗 -->
    <div v-if="enhancing" class="modal-mask" @click.self="enhancing = null">
      <div class="modal" style="width: 480px">
        <div class="modal-head">
          <h3>🧾 强化照片复核「{{ enhancing.name }}」</h3>
          <button class="modal-close" @click="enhancing = null">✕</button>
        </div>
        <div class="notice warn mb12">
          该家庭此前有物品多次现场退回。请逐项核对：多角度实拍照片、零件/缺件清单、成色与消毒情况，确认与报名描述完全一致。
        </div>
        <div class="field">
          <label class="check-line"><input v-model="enhancedChecks.photos" type="checkbox" /> 多角度实拍照片与实物一致</label>
          <label class="check-line"><input v-model="enhancedChecks.parts" type="checkbox" /> 已核对零件清单，无缺件（或家长已书面列明缺件）</label>
          <label class="check-line"><input v-model="enhancedChecks.desc" type="checkbox" /> 成色、品类与报名描述一致</label>
          <label class="check-line"><input v-model="enhancedChecks.sanitation" type="checkbox" /> 消毒状态可确认</label>
        </div>
        <div class="field">
          <label>复核说明<span class="req">*</span></label>
          <textarea v-model.trim="enhancedNote" class="textarea" placeholder="记录核对结果与缺件说明……" />
        </div>
        <div class="row">
          <button class="btn success" :disabled="!enhancedAllChecked" @click="confirmEnhanced(true)">✅ 核对无误，通过</button>
          <button class="btn danger" @click="confirmEnhanced(false)">🚫 材料不足，驳回重报</button>
          <button class="btn ghost" @click="enhancing = null">取消</button>
        </div>
      </div>
    </div>

    <ItemDetailModal :item="detail" @close="detail = null" />
  </AppShell>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import AppShell from '../../components/AppShell.vue'
import PhaseBar from '../../components/PhaseBar.vue'
import ItemCard from '../../components/ItemCard.vue'
import ItemDetailModal from '../../components/ItemDetailModal.vue'
import EmptyState from '../../components/EmptyState.vue'
import StatusBadge from '../../components/StatusBadge.vue'
import { useAuthStore } from '../../stores/auth'
import { useDataStore } from '../../stores/data'
import { CATEGORY_META, REJECT_REASONS } from '../../meta'
import { fmtTime } from '../../utils'
import type { Item } from '../../types'

const auth = useAuthStore()
const data = useDataStore()

const detail = ref<Item | null>(null)
const rejecting = ref<Item | null>(null)
const rejectReason = ref('')
const rejectNote = ref('')

const enhancing = ref<Item | null>(null)
const enhancedNote = ref('')
const enhancedChecks = reactive({ photos: false, parts: false, desc: false, sanitation: false })
const enhancedAllChecked = computed(
  () => enhancedChecks.photos && enhancedChecks.parts && enhancedChecks.desc && enhancedChecks.sanitation,
)

const reviewed = computed(() =>
  data.items.filter((i) => i.review && i.status !== 'pending'),
)

function approve(item: Item) {
  data.reviewItem(item.id, 'approved', auth.currentUser!.name)
}

function openReject(item: Item) {
  rejecting.value = item
  rejectReason.value = CATEGORY_META[item.category].allowed ? '' : REJECT_REASONS[
    ['dangerous', 'food', 'medicine', 'privacy'].indexOf(item.category)
  ] ?? ''
  rejectNote.value = ''
}

function confirmReject() {
  if (!rejecting.value) return
  if (!rejectReason.value) {
    alert('请选择驳回原因')
    return
  }
  const reason = rejectNote.value ? `${rejectReason.value}：${rejectNote.value}` : rejectReason.value
  data.reviewItem(rejecting.value.id, 'rejected', auth.currentUser!.name, reason)
  rejecting.value = null
}

function openEnhanced(item: Item) {
  enhancing.value = item
  enhancedNote.value = ''
  enhancedChecks.photos = enhancedChecks.parts = enhancedChecks.desc = enhancedChecks.sanitation = false
}

function confirmEnhanced(passed: boolean) {
  if (!enhancing.value) return
  if (passed && !enhancedNote.value.trim()) return alert('请填写复核说明与缺件核对结果')
  if (!passed && !enhancedNote.value.trim()) enhancedNote.value = '请补充零件清单与多角度实拍照片后重新报名'
  data.enhancedReviewItem(enhancing.value.id, passed, auth.currentUser!.name, enhancedNote.value)
  enhancing.value = null
}
</script>

<style scoped>
.review-row { margin-bottom: 4px; }
</style>
