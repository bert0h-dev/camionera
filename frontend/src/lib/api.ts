import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import type { User } from './types'

export const api = axios.create({ baseURL: '/api', withCredentials: true })

// El access token vive solo en memoria; el refresh token en una cookie httpOnly
let accessToken: string | null = null
let onSessionExpired: (() => void) | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler
}

export interface SessionResponse {
  user: User
  accessToken: string
}

// Una sola petición de refresh en curso aunque fallen varias llamadas a la vez
let refreshing: Promise<SessionResponse> | null = null

export function refreshSession() {
  refreshing ??= axios
    .post<SessionResponse>('/api/auth/refresh', null, { withCredentials: true })
    .then((res) => {
      setAccessToken(res.data.accessToken)
      return res.data
    })
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
  return config
})

api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined
  const isAuthRoute = original?.url?.startsWith('/auth/')

  if (error.response?.status === 401 && original && !original._retry && !isAuthRoute) {
    original._retry = true
    try {
      await refreshSession()
      return api(original)
    } catch {
      setAccessToken(null)
      onSessionExpired?.()
    }
  }
  return Promise.reject(error)
})

/** Extrae un mensaje legible de un error de la API. */
export function apiErrorMessage(error: unknown, fallback = 'Ocurrió un error') {
  if (error instanceof AxiosError) {
    const message = (error.response?.data as { message?: string | string[] } | undefined)?.message
    if (Array.isArray(message)) return message.join(', ')
    if (message) return message
  }
  return fallback
}
