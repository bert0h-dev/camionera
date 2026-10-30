import { api } from '../../lib/api'
import type { PaymentMethod } from '../../lib/types'

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  mercadopago: 'Mercado Pago',
}

/** Abre los boletos de una compra en otra pestaña (el PDF pide el token, por eso no es un enlace directo). */
export async function openOrderPdf(orderId: string) {
  // La pestaña se abre antes de la descarga para que el navegador no la bloquee
  const tab = window.open('', '_blank')
  const { data } = await api.get<Blob>(`/tickets/orders/${orderId}/pdf`, { responseType: 'blob' })
  const url = URL.createObjectURL(data)
  if (tab) tab.location.href = url
  else window.location.href = url
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
