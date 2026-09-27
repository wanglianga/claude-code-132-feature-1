<template>
  <div class="card item-card">
    <ItemPhoto :photo="item.photos[0]" :category="item.category" />
    <div class="item-info">
      <div class="item-name">
        <span>{{ CATEGORY_META[item.category].icon }} {{ item.name }}</span>
        <StatusBadge :status="item.status" />
      </div>
      <div class="item-meta">
        <span>编号 {{ item.code }}</span>
        <span>{{ CONDITION_META[item.condition] }}</span>
        <span>价值 {{ fmtValue(item.valueRange) }}</span>
        <span>适合 {{ fmtAge(item.ageRange) }}</span>
        <span>{{ item.disinfected ? '✅ 已消毒' : '⚠️ 未消毒' }}</span>
        <span v-if="item.booth">摊位 {{ item.booth }}</span>
        <span v-if="item.entryTime">入场 {{ item.entryTime }}</span>
      </div>
      <div class="item-meta" v-if="showOwner && owner">
        <span>家长：{{ owner.name }}（孩子 {{ owner.childName }} {{ owner.childAge }} 岁）</span>
        <span v-if="owner.phone">电话 {{ owner.phone }}</span>
      </div>
      <div class="tag-list mt8">
        <span class="tag">期望：{{ desiredText }}</span>
        <span class="tag">可到场：{{ item.timeSlots.join('、') }}</span>
        <span class="tag">{{ item.acceptDonation ? '接受公益捐赠' : '不接受捐赠' }}</span>
      </div>
      <div v-if="item.review?.result === 'rejected'" class="notice error mt8">
        驳回原因：{{ item.review.reason }}
      </div>
      <div class="item-actions">
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Item } from '../types'
import { CATEGORY_META, CONDITION_META } from '../meta'
import { fmtAge, fmtValue } from '../utils'
import { useDataStore } from '../stores/data'
import ItemPhoto from './ItemPhoto.vue'
import StatusBadge from './StatusBadge.vue'

const props = withDefaults(defineProps<{ item: Item; showOwner?: boolean }>(), { showOwner: false })
const data = useDataStore()
const owner = computed(() => data.userById(props.item.parentId))
const desiredText = computed(() =>
  props.item.desiredCategories.length
    ? props.item.desiredCategories.map((c) => CATEGORY_META[c].label).join('、')
    : '不限',
)
</script>
