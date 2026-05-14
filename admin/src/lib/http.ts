import axios from 'axios'

import { AUTH_STORAGE_KEY } from '../stores/auth'

const getToken = () => {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY)
  if (!raw) {
    return ''
  }

  try {
    const parsed = JSON.parse(raw) as { token?: string }
    return parsed.token || ''
  } catch {
    return ''
  }
}

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'https://6sr8wc135175.vicp.fun',
  timeout: 15000,
})

http.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

http.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(AUTH_STORAGE_KEY)
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)
