<template>
  <div v-if="item" class="modal-mask" @click.self="$emit('close')">
    <div class="modal">
      <div class="modal-head">
        <h3>{{ CATEGORY_META[item.category].icon }} {{ item.name }}</h3>
        <button class="modal-close" @click="$emit('close')">✕</button>
      </div>

      <div class="row" style="align-items: flex-start; gap: 16px">
        <ItemPhoto :photo="item.photos[0]" :category="item.category" lg />
        <div style="flex: 1">
          <div class="row wrap" style="gap: 6px">
            <StatusBadge :status="item.status" />
            <span class="tag">编号 {{ item.code }}</span>
            <span class="tag">{{ CONDITION_META[item.condition] }}</span>
            <span class="tag">{{ item.disinfected ? '已消毒' : '未消毒' }}</span>
          </div>
          <table class="table mt12">
            <tbody>
              <tr><th>所属家长</th><td>{{ owner?.name }}（孩子 {{ owner?.childName }} {{ owner?.childAge }} 岁）</td></tr>
              <tr><th>品类</th><td>{{ CATEGORY_META[item.category].label }}</td></tr>
              <tr><th>参考价值</th><td>{{ fmtValue(item.valueRange) }}</td></tr>
              <tr><th>适合年龄</th><td>{{ fmtAge(item.ageRange) }}</td></tr>
              <tr><th>期望换取</th><td>{{ desiredText }}</td></tr>
              <tr><th>可到场时间</th><td>{{ item.timeSlots.join('、') }}</td></tr>
              <tr><th>公益捐赠</th><td>{{ item.acceptDonation ? '未换出时接受捐赠' : '不接受' }}</td></tr>
              <tr v-if="item.note"><th>备注</th><td>{{ item.note }}</td></tr>
              <tr v-if="item.booth"><th>摊位 / 入场</th><td>{{ item.booth }} · {{ item.entryTime }}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <template v-if="item.photos.length > 1">
        <div class="divider" />
        <div class="row wrap">
          <ItemPhoto v-for="(p, i) in item.photos" :key="i" :photo="p" :category="item.category" />
        </div>
      </template>

      <template v-if="item.checkIn">
        <div class="divider" />
        <div class="card-title">现场核销记录</div>
        <div class="tag-list">
          <span class="tag">{{ item.checkIn.photoMatch ? '✅ 照片与实物一致' : '❌ 实物与照片不符' }}</span>
          <span class="tag">{{ damageText }}</span>
          <span class="tag">{{ item.checkIn.disinfectedConfirmed ? '✅ 已确认消毒' : '❌ 未确认消毒' }}</span>
          <span class="tag">{{ item.checkIn.passed ? '核验通过' : '核验存疑' }}</span>
        </div>
        <p v-if="item.checkIn.note" class="small muted mt8">备注：{{ item.checkIn.note }}</p>
        <p class="small muted">核销人 {{ item.checkIn.by }} · {{ fmtTime(item.checkIn.at) }}</p>
      </template>

      <div class="divider" />
      <div class="card-title">流转记录</div>
      <ItemTimeline :history="item.history" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Item } from '../types'
import { CATEGORY_META, CONDITION_META } from '../meta'
import { fmtAge, fmtTime, fmtValue } from '../utils'
import { useDataStore } from '../stores/data'
import ItemPhoto from './ItemPhoto.vue'
import StatusBadge from './StatusBadge.vue'
import ItemTimeline from './ItemTimeline.vue'

const props = defineProps<{ item: Item | null }>()
defineEmits<{ close: [] }>()

const data = useDataStore()
const owner = computed(() => (props.item ? data.userById(props.item.parentId) : null))
const desiredText = computed(() =>
  props.item?.desiredCategories.length
    ? props.item.desiredCategories.map((c) => CATEGORY_META[c].label).join('、')
    : '不限',
)
const damageText = computed(() => {
  const d = props.item?.checkIn?.damage
  return d === 'none' ? '✅ 无破损' : d === 'minor' ? '⚠️ 轻微破损' : '❌ 严重破损'
})
</script>
