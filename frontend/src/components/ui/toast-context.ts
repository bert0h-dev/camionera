import { createContext, useContext } from 'react'

export type ToastKind = 'success' | 'error'

export const ToastContext = createContext<((kind: ToastKind, message: string) => void) | null>(null)

export function useToast() {
  const show = useContext(ToastContext)
  if (!show) throw new Error('useToast debe usarse dentro de <ToastProvider>')
  return { success: (m: string) => show('success', m), error: (m: string) => show('error', m) }
}
