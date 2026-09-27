<template>
  <div class="login-page">
    <div class="login-card">
      <div style="text-align: center; margin-bottom: 20px">
        <div style="font-size: 42px">🔄🧸</div>
        <h1 style="font-size: 21px; margin-top: 6px">阳光社区 · 亲子旧物交换平台</h1>
        <p class="muted small mt8">报名 · 审核 · 撮合 · 预约 · 核销 · 交换 · 转捐，一件物品全程可追踪</p>
      </div>

      <div class="field">
        <label>账号</label>
        <input v-model="username" class="input" placeholder="请输入账号" @keyup.enter="doLogin" />
      </div>
      <div class="field">
        <label>密码</label>
        <input v-model="password" type="password" class="input" placeholder="请输入密码" @keyup.enter="doLogin" />
      </div>
      <div v-if="error" class="notice error mb12">{{ error }}</div>
      <button class="btn primary lg block" @click="doLogin">登 录</button>

      <div class="divider" />
      <p class="small muted mb8">测试账号（点击填充，密码均为 123456）：</p>
      <div class="grid cols-2" style="gap: 8px">
        <div v-for="acc in accounts" :key="acc.username" class="account-chip" @click="fill(acc.username)">
          <span>{{ acc.icon }}</span>
          <div>
            <div>{{ acc.name }} <span class="r">{{ acc.username }}</span></div>
            <div class="r">{{ acc.role }}</div>
          </div>
        </div>
      </div>

      <div class="divider" />
      <button class="btn ghost sm block" @click="resetData">↺ 重置演示数据（恢复初始状态）</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useDataStore } from '../stores/data'
import { homeOf } from '../router'

const auth = useAuthStore()
const data = useDataStore()
const router = useRouter()

const username = ref('')
const password = ref('')
const error = ref('')

const accounts = [
  { username: 'parent1', name: '王晓', role: '家长（孩子 5 岁）', icon: '👨‍👩‍👧' },
  { username: 'parent2', name: '李敏', role: '家长（孩子 7 岁）', icon: '👩‍👦' },
  { username: 'staff', name: '王芳', role: '社区工作人员', icon: '🏢' },
  { username: 'volunteer', name: '赵伟', role: '志愿者', icon: '🙋' },
  { username: 'charity', name: '刘洋', role: '公益机构 · 春芽公益', icon: '💚' },
  { username: 'parent3', name: '张磊', role: '家长（孩子 3 岁）', icon: '👨‍👧' },
]

function fill(u: string) {
  username.value = u
  password.value = '123456'
  error.value = ''
}

function doLogin() {
  if (!username.value || !password.value) {
    error.value = '请输入账号和密码'
    return
  }
  const err = auth.login(username.value, password.value)
  if (err) {
    error.value = err
    return
  }
  router.push(homeOf(auth.currentUser!.role))
}

function resetData() {
  data.resetAll()
  auth.logout()
  error.value = ''
  username.value = ''
  password.value = ''
  alert('演示数据已重置为初始状态')
}
</script>
