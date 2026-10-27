import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Los e2e comparten la BD (y la secuencia de empleados): se ejecutan en serie
    fileParallelism: false,
    // Neon remoto: cada prueba hace varias idas y vueltas a la BD
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
