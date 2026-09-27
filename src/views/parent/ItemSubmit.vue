<template>
  <AppShell>
    <h2 class="page-title">报名新物品</h2>
    <p class="page-desc">
      孩子：{{ user.childName }}（{{ user.childAge }} 岁） · 提交后由社区工作人员审核，通过即可进入撮合池
    </p>

    <div class="card" style="max-width: 720px">
      <div class="field">
        <label>物品名称<span class="req">*</span></label>
        <input v-model.trim="form.name" class="input" placeholder="例如：乐高经典积木盒" />
      </div>

      <div class="field">
        <label>物品品类<span class="req">*</span></label>
        <div class="chip-row">
          <button
            v-for="c in allCategories"
            :key="c"
            type="button"
            class="chip"
            :class="{ on: form.category === c, warn: isForbidden(c) && form.category === c }"
            @click="form.category = c"
          >
            {{ CATEGORY_META[c].icon }} {{ CATEGORY_META[c].label }}
            <span v-if="isForbidden(c)" style="font-size: 11px">（禁入）</span>
          </button>
        </div>
        <div v-if="form.category && isForbidden(form.category)" class="notice error mt8">
          ⚠️ 「{{ CATEGORY_META[form.category].label }}」不在可交换范围内（危险品 / 食品 / 药品 / 隐私物品禁止入场），提交后将被审核驳回。
        </div>
      </div>

      <div class="grid cols-2">
        <div class="field">
          <label>成色<span class="req">*</span></label>
          <select v-model="form.condition" class="select">
            <option v-for="(label, key) in CONDITION_META" :key="key" :value="key">{{ label }}</option>
          </select>
        </div>
        <div class="field">
          <label>参考价值<span class="req">*</span></label>
          <select v-model="valueIdx" class="select">
            <option v-for="(v, i) in VALUE_RANGES" :key="i" :value="i">{{ v.label }}</option>
          </select>
        </div>
      </div>

      <div class="field">
        <label>适合年龄段<span class="req">*</span></label>
        <div class="chip-row">
          <button
            v-for="(a, i) in AGE_RANGES"
            :key="i"
            type="button"
            class="chip"
            :class="{ on: ageIdx === i }"
            @click="ageIdx = i"
          >
            {{ a.label }}
          </button>
        </div>
      </div>

      <div class="field">
        <label>成色照片<span class="req">*</span> <span class="muted" style="font-weight: 400">（现场核销需与实物比对，最多 3 张）</span></label>
        <div class="row wrap">
          <div v-for="(p, i) in form.photos" :key="i" style="position: relative">
            <ItemPhoto :photo="p" :category="form.category || 'toy'" />
            <button
              type="button"
              class="modal-close"
              style="position: absolute; top: -6px; right: -6px; width: 20px; height: 20px; font-size: 10px"
              @click="form.photos.splice(i, 1)"
            >✕</button>
          </div>
          <label v-if="form.photos.length < 3" class="item-photo" style="cursor: pointer; font-size: 24px; color: var(--ink-3)">
            ＋
            <input type="file" accept="image/*" style="display: none" @change="onPhoto" />
          </label>
        </div>
        <p class="hint">未上传照片时将使用品类图标占位，建议上传真实照片以便现场核销</p>
      </div>

      <div class="field">
        <label>期望换取类型（可多选）<span class="req">*</span></label>
        <div class="chip-row">
          <button
            v-for="c in ALLOWED_CATEGORIES"
            :key="c"
            type="button"
            class="chip"
            :class="{ on: form.desiredCategories.includes(c) }"
            @click="toggleDesired(c)"
          >
            {{ CATEGORY_META[c].icon }} {{ CATEGORY_META[c].label }}
          </button>
        </div>
      </div>

      <div class="field">
        <label>可到场时间（可多选）<span class="req">*</span></label>
        <div class="chip-row">
          <button
            v-for="s in event.timeSlots"
            :key="s"
            type="button"
            class="chip"
            :class="{ on: form.timeSlots.includes(s) }"
            @click="toggleSlot(s)"
          >
            🕐 {{ s }}
          </button>
        </div>
      </div>

      <div class="grid cols-2">
        <div class="field">
          <label class="check-line">
            <input v-model="form.disinfected" type="checkbox" />
            物品已完成清洁消毒
          </label>
          <p class="hint">现场核销时志愿者会再次确认消毒情况</p>
        </div>
        <div class="field">
          <label class="check-line">
            <input v-model="form.acceptDonation" type="checkbox" />
            未换出时接受公益捐赠
          </label>
          <p class="hint">无人交换的物品可转赠给合作公益机构</p>
        </div>
      </div>

      <div class="field">
        <label>备注说明</label>
        <textarea v-model.trim="form.note" class="textarea" placeholder="例如：配件齐全、有轻微使用痕迹……" />
      </div>

      <div v-if="error" class="notice error mb12">{{ error }}</div>
      <div class="row">
        <button class="btn primary lg" @click="submit">提交报名</button>
        <router-link to="/parent/items" class="btn ghost">取消</router-link>
      </div>
    </div>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '../../components/AppShell.vue'
import ItemPhoto from '../../components/ItemPhoto.vue'
import { useAuthStore } from '../../stores/auth'
import { useDataStore } from '../../stores/data'
import { AGE_RANGES, ALLOWED_CATEGORIES, CATEGORY_META, CONDITION_META, VALUE_RANGES } from '../../meta'
import type { Category, Condition } from '../../types'

const auth = useAuthStore()
const data = useDataStore()
const router = useRouter()

const user = computed(() => auth.currentUser!).value
const event = computed(() => data.event)

const allCategories = Object.keys(CATEGORY_META) as Category[]
const isForbidden = (c: Category) => !CATEGORY_META[c].allowed

const form = reactive({
  name: '',
  category: '' as Category | '',
  condition: 'good' as Condition,
  photos: [] as string[],
  disinfected: false,
  desiredCategories: [] as Category[],
  timeSlots: [] as string[],
  acceptDonation: true,
  note: '',
})
const valueIdx = ref(1)
const ageIdx = ref(1)
const error = ref('')

function toggleDesired(c: Category) {
  const i = form.desiredCategories.indexOf(c)
  if (i >= 0) form.desiredCategories.splice(i, 1)
  else form.desiredCategories.push(c)
}

function toggleSlot(s: string) {
  const i = form.timeSlots.indexOf(s)
  if (i >= 0) form.timeSlots.splice(i, 1)
  else form.timeSlots.push(s)
}

function onPhoto(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const scale = Math.min(1, 480 / Math.max(img.width, img.height))
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      form.photos.push(canvas.toDataURL('image/jpeg', 0.75))
    }
    img.src = String(reader.result)
  }
  reader.readAsDataURL(file)
  ;(e.target as HTMLInputElement).value = ''
}

function submit() {
  if (!form.name) return (error.value = '请填写物品名称')
  if (!form.category) return (error.value = '请选择物品品类')
  if (!form.desiredCategories.length) return (error.value = '请选择期望换取类型')
  if (!form.timeSlots.length) return (error.value = '请选择可到场时间')
  error.value = ''
  const category = form.category as Category
  data.submitItem(
    {
      parentId: user.id,
      name: form.name,
      category,
      condition: form.condition,
      photos: form.photos.length ? [...form.photos] : [CATEGORY_META[category].icon],
      disinfected: form.disinfected,
      desiredCategories: [...form.desiredCategories],
      valueRange: VALUE_RANGES[valueIdx.value].range,
      ageRange: AGE_RANGES[ageIdx.value].range,
      timeSlots: [...form.timeSlots],
      acceptDonation: form.acceptDonation,
      note: form.note || undefined,
    },
    user.name,
  )
  router.push('/parent/items')
}
</script>
