<template>
  <AppShell>
    <h2 class="page-title">物品审核</h2>
    <p class="page-desc">玩具、绘本、衣物、学习用品、婴童用品可进入交换；危险品、食品、药品、隐私物品需驳回并说明原因</p>

    <PhaseBar />

    <div class="card mt16">
      <div class="card-title">⏳ 待审核（{{ data.pendingItems.length }}）</div>
      <template v-if="data.pendingItems.length">
        <div v-for="item in data.pendingItems" :key="item.id" class="review-row">
          <ItemCard :item="item" show-owner>
            <template #actions>
              <button class="btn sm success" @click="approve(item)">✅ 通过</button>
              <button class="btn sm danger" @click="openReject(item)">🚫 驳回</button>
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

    <ItemDetailModal :item="detail" @close="detail = null" />
  </AppShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
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
</script>

<style scoped>
.review-row { margin-bottom: 4px; }
</style>
