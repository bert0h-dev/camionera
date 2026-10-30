import { describe, expect, it } from 'vitest';
import { PaymentMethod } from '../generated/prisma/enums.js';
import { parseImageDataUrl } from '../files/file-rules.js';
import { qrToken, verifyQrToken } from './qr-token.js';
import { checkPayments, passengerError } from './sale-rules.js';

describe('passengerError', () => {
  it('pide nombre y, si el tipo lo exige, identificación', () => {
    expect(passengerError({ name: 'Ana', requiresId: false }, '4')).toBeNull();
    expect(passengerError({ name: ' ', requiresId: false }, '4')).toMatch(
      /nombre/,
    );
    expect(
      passengerError({ name: 'Luis Pérez', requiresId: true }, '7'),
    ).toMatch(/identificación/);
    expect(
      passengerError(
        { name: 'Luis Pérez', requiresId: true, document: 'INAPAM 123' },
        '7',
      ),
    ).toBeNull();
  });
});

describe('checkPayments', () => {
  it('efectivo con cambio', () => {
    expect(
      checkPayments(
        [{ method: PaymentMethod.cash, amount: 860, received: 1000 }],
        860,
      ),
    ).toEqual({ ok: true, change: 140 });
  });
  it('pago mixto que cuadra', () => {
    expect(
      checkPayments(
        [
          { method: PaymentMethod.cash, amount: 300.5 },
          { method: PaymentMethod.card, amount: 559.5, reference: 'A1B2' },
        ],
        860,
      ),
    ).toEqual({ ok: true, change: 0 });
  });
  it('rechaza faltante, excedente, referencia vacía y efectivo corto', () => {
    const check = (p: Parameters<typeof checkPayments>[0]) =>
      checkPayments(p, 860);
    expect(check([{ method: PaymentMethod.cash, amount: 800 }])).toMatchObject({
      error: expect.stringMatching(/Faltan \$60.00/),
    });
    expect(check([{ method: PaymentMethod.cash, amount: 900 }])).toMatchObject({
      error: expect.stringMatching(/pasan/),
    });
    expect(check([{ method: PaymentMethod.card, amount: 860 }])).toMatchObject({
      error: expect.stringMatching(/autorización/),
    });
    expect(
      check([{ method: PaymentMethod.cash, amount: 860, received: 500 }]),
    ).toMatchObject({ error: expect.stringMatching(/recibido/) });
    expect(
      check([{ method: PaymentMethod.mercadopago, amount: 860 }]),
    ).toMatchObject({ error: expect.stringMatching(/taquilla/) });
  });
});

describe('qrToken', () => {
  const id = '01a18df7-8100-723c-8562-02044be8fd54';
  it('verifica el token propio y rechaza uno alterado o con otro secreto', () => {
    const token = qrToken(id, 'secreto');
    expect(verifyQrToken(token, 'secreto')).toBe(id);
    expect(verifyQrToken(token, 'otro')).toBeNull();
    expect(
      verifyQrToken(token.replace(id, id.replace('a', 'b')), 'secreto'),
    ).toBeNull();
    expect(verifyQrToken('basura', 'secreto')).toBeNull();
  });
});

describe('parseImageDataUrl', () => {
  it('acepta PNG pequeños y rechaza otros tipos o tamaños', () => {
    const png = `data:image/png;base64,${Buffer.from('hola').toString('base64')}`;
    expect(parseImageDataUrl(png)).toMatchObject({
      ok: true,
      contentType: 'image/png',
    });
    expect(parseImageDataUrl('data:image/gif;base64,AAAA')).toMatchObject({
      ok: false,
    });
    expect(parseImageDataUrl(png, 2)).toMatchObject({ ok: false });
    expect(parseImageDataUrl('no')).toMatchObject({ ok: false });
  });
});
