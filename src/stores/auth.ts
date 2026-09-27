import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useDataStore } from './data'

const AUTH_KEY = 'swapmeet-auth-v1'

export const useAuthStore = defineStore('auth', () => {
  const data = useDataStore()
  const currentUserId = ref<string | null>(localStorage.getItem(AUTH_KEY))

  const currentUser = computed(() =>
    currentUserId.value ? data.userById(currentUserId.value) ?? null : null,
  )

  function login(username: string, password: string): string | null {
    const user = data.users.find((u) => u.username === username.trim())
    if (!user) return '账号不存在'
    if (user.password !== password) return '密码错误'
    currentUserId.value = user.id
    localStorage.setItem(AUTH_KEY, user.id)
    return null
  }

  function logout() {
    currentUserId.value = null
    localStorage.removeItem(AUTH_KEY)
  }

  return { currentUserId, currentUser, login, logout }
})
