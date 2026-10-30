// Dinero en centavos enteros para no arrastrar errores de punto flotante.

export const toCents = (n: number) => Math.round(n * 100);
export const fromCents = (c: number) => c / 100;
