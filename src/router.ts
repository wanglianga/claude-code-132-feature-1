import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from './stores/auth'
import type { Role } from './types'

const LoginView = () => import('./views/LoginView.vue')

declare module 'vue-router' {
  interface RouteMeta {
    role?: Role
  }
}

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginView },
    { path: '/', redirect: '/login' },
    // 家长端
    { path: '/parent/items', name: 'parent-items', component: () => import('./views/parent/ParentItems.vue'), meta: { role: 'parent' } },
    { path: '/parent/submit', name: 'parent-submit', component: () => import('./views/parent/ItemSubmit.vue'), meta: { role: 'parent' } },
    { path: '/parent/matches', name: 'parent-matches', component: () => import('./views/parent/MatchCenter.vue'), meta: { role: 'parent' } },
    { path: '/parent/incidents', name: 'parent-incidents', component: () => import('./views/parent/ParentIncidents.vue'), meta: { role: 'parent' } },
    // 社区工作人员
    { path: '/staff/review', name: 'staff-review', component: () => import('./views/staff/ReviewQueue.vue'), meta: { role: 'staff' } },
    { path: '/staff/match', name: 'staff-match', component: () => import('./views/staff/MatchManage.vue'), meta: { role: 'staff' } },
    { path: '/staff/onsite', name: 'staff-onsite', component: () => import('./views/staff/OnsiteBoard.vue'), meta: { role: 'staff' } },
    { path: '/staff/incidents', name: 'staff-incidents', component: () => import('./views/staff/ExceptionDesk.vue'), meta: { role: 'staff' } },
    { path: '/staff/summary', name: 'staff-summary', component: () => import('./views/staff/SummaryView.vue'), meta: { role: 'staff' } },
    // 志愿者
    { path: '/volunteer', name: 'volunteer', component: () => import('./views/volunteer/CheckInView.vue'), meta: { role: 'volunteer' } },
    // 公益机构
    { path: '/charity', name: 'charity', component: () => import('./views/charity/DonationView.vue'), meta: { role: 'charity' } },
  ],
})

const HOME_BY_ROLE: Record<Role, string> = {
  parent: '/parent/items',
  staff: '/staff/review',
  volunteer: '/volunteer',
  charity: '/charity',
}

export function homeOf(role: Role): string {
  return HOME_BY_ROLE[role]
}

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.name === 'login') {
    if (auth.currentUser) return homeOf(auth.currentUser.role)
    return true
  }
  if (!auth.currentUser) return { name: 'login' }
  if (to.meta.role && to.meta.role !== auth.currentUser.role) {
    return homeOf(auth.currentUser.role)
  }
  return true
})
