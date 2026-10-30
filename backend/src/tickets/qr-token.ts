// Token del QR de un boleto: id del boleto + firma HMAC. No se puede inventar sin el secreto.

import { createHmac, timingSafeEqual } from 'node:crypto';

const PREFIX = 'CC1';

const sign = (ticketId: string, secret: string) =>
  createHmac('sha256', secret)
    .update(`${PREFIX}.${ticketId}`)
    .digest('base64url')
    .slice(0, 32);

export const qrToken = (ticketId: string, secret: string) =>
  `${PREFIX}.${ticketId}.${sign(ticketId, secret)}`;

/** Id del boleto si el token es auténtico; null si no. */
export function verifyQrToken(token: string, secret: string): string | null {
  const [prefix, ticketId, signature] = token.trim().split('.');
  if (prefix !== PREFIX || !ticketId || !signature) return null;
  const expected = Buffer.from(sign(ticketId, secret));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given)
    ? ticketId
    : null;
}
