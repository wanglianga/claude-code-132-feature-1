<template>
  <div v-if="user" class="shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="logo">🔄🧸</div>
        <h1>亲子旧物交换平台</h1>
        <p>阳光社区 · 循环小市集</p>
      </div>
      <nav class="nav">
        <template v-for="group in navGroups" :key="group.title">
          <div class="nav-group">{{ group.title }}</div>
          <router-link
            v-for="item in group.items"
            :key="item.to"
            :to="item.to"
            :class="{ active: isActive(item.to) }"
          >
            <span>{{ item.icon }}</span>
            <span>{{ item.label }}</span>
            <span v-if="item.badge" class="badge-dot">{{ item.badge }}</span>
          </router-link>
        </template>
      </nav>
      <div class="user-box">
        <div class="who">
          <div class="avatar">{{ ROLE_META[user.role].icon }}</div>
          <div>
            <div class="name">{{ user.name }}</div>
            <div class="role">{{ ROLE_META[user.role].label }}<template v-if="user.orgName"> · {{ user.orgName }}</template></div>
          </div>
        </div>
        <button class="logout-btn" @click="logout">退出登录</button>
      </div>
    </aside>

    <div class="main">
      <div class="topbar">
        <div>
          <div class="event-name">{{ event.name }}</div>
          <div class="event-meta">📅 {{ event.date }} · 📍 {{ event.venue }}</div>
        </div>
        <span class="badge orange" style="margin-left: auto">{{ PHASE_META[event.phase].label }}阶段</span>
      </div>
      <main class="content">
        <slot />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useDataStore } from '../stores/data'
import { PHASE_META, ROLE_META } from '../meta'

const auth = useAuthStore()
const data = useDataStore()
const route = useRoute()
const router = useRouter()

const user = computed(() => auth.currentUser)
const event = computed(() => data.event)

const openIncidentCount = computed(() => data.openIncidents.length)
const pendingCount = computed(() => data.pendingItems.length)
const myIncidentCount = computed(() => {
  if (!auth.currentUser) return 0
  return data.incidents.filter(
    (i) => i.status !== 'resolved' && data.itemById(i.itemId)?.parentId === auth.currentUser!.id,
  ).length
})
const requestedDonations = computed(
  () => data.donations.filter((d) => d.status === 'requested').length,
)
const myMatchCount = computed(() => {
  if (!auth.currentUser) return 0
  return data.matches.filter((m) => {
    if (!['proposed', 'accepted_a', 'accepted_b'].includes(m.status)) return false
    const a = data.itemById(m.itemAId)
    const b = data.itemById(m.itemBId)
    return a?.parentId === auth.currentUser!.id || b?.parentId === auth.currentUser!.id
  }).length
})

interface NavItem { to: string; icon: string; label: string; badge?: number }
interface NavGroup { title: string; items: NavItem[] }

const navGroups = computed<NavGroup[]>(() => {
  if (!user.value) return []
  switch (user.value.role) {
    case 'parent':
      return [
        {
          title: '我的参与',
          items: [
            { to: '/parent/items', icon: '📦', label: '我的物品' },
            { to: '/parent/submit', icon: '➕', label: '报名新物品' },
            { to: '/parent/matches', icon: '🤝', label: '撮合中心', badge: myMatchCount.value || undefined },
            { to: '/parent/incidents', icon: '🛟', label: '争议协调', badge: myIncidentCount.value || undefined },
          ],
        },
      ]
    case 'staff':
      return [
        {
          title: '活动管理',
          items: [
            { to: '/staff/review', icon: '🔍', label: '物品审核', badge: pendingCount.value || undefined },
            { to: '/staff/match', icon: '🧩', label: '撮合管理' },
            { to: '/staff/onsite', icon: '🏟️', label: '现场总览' },
            { to: '/staff/incidents', icon: '🛟', label: '异常处置', badge: openIncidentCount.value || undefined },
            { to: '/staff/summary', icon: '📊', label: '活动总结' },
          ],
        },
      ]
    case 'volunteer':
      return [
        {
          title: '现场工作',
          items: [{ to: '/volunteer', icon: '📷', label: '扫码核销台' }],
        },
      ]
    case 'charity':
      return [
        {
          title: '公益接收',
          items: [{ to: '/charity', icon: '💚', label: '捐赠接收', badge: requestedDonations.value || undefined }],
        },
      ]
  }
})

function isActive(to: string) {
  return route.path === to
}

function logout() {
  auth.logout()
  router.push('/login')
}
</script>
