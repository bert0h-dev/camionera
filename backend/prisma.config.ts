import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Las migraciones usan la conexión directa de Neon (sin pooler)
    url: env('DIRECT_URL'),
  },
});
