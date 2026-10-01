<template>
  <AppShell>
    <div class="row between mb16">
      <div>
        <h2 class="page-title">我的物品</h2>
        <p class="page-desc">从提交、审核、撮合、预约到核销、交换的每一步都会在这里留下记录</p>
      </div>
      <router-link to="/parent/submit" class="btn primary">➕ 报名新物品</router-link>
    </div>

    <div v-if="myItems.length" class="grid cols-2">
      <ItemCard v-for="item in myItems" :key="item.id" :item="item">
        <template #actions>
          <button class="btn sm outline" @click="detail = item">📋 流转详情</button>
          <router-link v-if="item.status === 'approved'" to="/parent/matches" class="btn sm primary">去撮合</router-link>
          <router-link v-if="item.status === 'matched'" to="/parent/matches" class="btn sm primary">确认撮合</router-link>
          <button v-if="item.status === 'reserved'" class="btn sm primary" @click="pass = item">🎫 入场凭证</button>
          <button v-if="item.status === 'frozen'" class="btn sm danger" @click="$router.push('/parent/incidents')">🧊 物品冻结中，查看处置</button>
          <button v-if="item.status === 'disputed'" class="btn sm danger" @click="$router.push('/parent/incidents')">🛟 查看争议</button>
          <template v-if="item.status === 'no_exchange'">
            <button v-if="item.acceptDonation && !hasDonation(item.id)" class="btn sm success" @click="donate(item)">💚 申请转捐</button>
            <span v-if="hasDonation(item.id)" class="badge pink">已申请转捐，等待接收</span>
            <button class="btn sm outline" @click="takeBack(item)">🎒 自行带回</button>
          </template>
          <span v-if="item.status === 'free_zone'" class="badge slate">可在自由交换区现场交换</span>
        </template>
      </ItemCard>
    </div>
    <div v-else class="card">
      <EmptyState icon="📦" text="还没有报名物品，点击右上角「报名新物品」开始吧">
        <router-link to="/parent/submit" class="btn primary mt12">➕ 报名新物品</router-link>
      </EmptyState>
    </div>

    <!-- 入场凭证 -->
    <div v-if="pass" class="modal-mask" @click.self="pass = null">
      <div class="modal" style="width: 420px; text-align: center">
        <div class="modal-head">
          <h3>🎫 入场凭证</h3>
          <button class="modal-close" @click="pass = null">✕</button>
        </div>
        <p style="font-weight: 700; font-size: 16px">{{ pass.name }}</p>
        <p class="muted small mb12">请向现场志愿者出示此码完成核销</p>
        <QrCode :code="pass.code" />
        <div class="grid cols-2 mt16" style="text-align: left">
          <div class="card" style="padding: 12px; box-shadow: none">
            <div class="small muted">入场时段</div>
            <div style="font-weight: 700">🕐 {{ pass.entryTime }}</div>
          </div>
          <div class="card" style="padding: 12px; box-shadow: none">
            <div class="small muted">交换摊位</div>
            <div style="font-weight: 700">📍 {{ pass.booth }}</div>
          </div>
        </div>
        <div class="notice info mt16" style="text-align: left">
          温馨提示：请确保携带物品与报名照片一致、提前完成消毒；如无法到场请提前联系社区工作人员。
        </div>
      </div>
    </div>

    <ItemDetailModal :item="detail" @close="detail = null" />
  </AppShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import AppShell from '../../components/AppShell.vue'
import ItemCard from '../../components/ItemCard.vue'
import ItemDetailModal from '../../components/ItemDetailModal.vue'
import EmptyState from '../../components/EmptyState.vue'
import QrCode from '../../components/QrCode.vue'
import { useAuthStore } from '../../stores/auth'
import { useDataStore } from '../../stores/data'
import type { Item } from '../../types'

const auth = useAuthStore()
const data = useDataStore()

const detail = ref<Item | null>(null)
const pass = ref<Item | null>(null)

const myItems = computed(() => data.itemsByParent(auth.currentUser?.id ?? ''))

function hasDonation(itemId: string) {
  return data.donations.some((d) => d.itemId === itemId && d.status !== 'declined')
}

function donate(item: Item) {
  data.requestDonation(item.id, auth.currentUser!.name)
}

function takeBack(item: Item) {
  if (confirm(`确认将「${item.name}」自行带回吗？`)) {
    data.takeBack(item.id, auth.currentUser!.name)
  }
}
</script>
