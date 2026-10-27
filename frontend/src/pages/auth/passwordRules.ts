export const MIN_PASSWORD = 8

/** Reglas visibles de la contraseña nueva. */
export function passwordChecks(password: string, confirm: string) {
  return [
    { ok: password.length >= MIN_PASSWORD, label: `Al menos ${MIN_PASSWORD} caracteres` },
    { ok: /[A-Za-z]/.test(password) && /\d/.test(password), label: 'Letras y números' },
    { ok: password.length > 0 && password === confirm, label: 'Ambas contraseñas coinciden' },
  ]
}
