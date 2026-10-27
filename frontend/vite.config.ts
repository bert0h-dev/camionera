import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// Librerías grandes y estables en paquetes aparte: el navegador las conserva en caché
// aunque cambie el código de la app
const VENDOR_GROUPS: Record<string, RegExp> = {
  react: /node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/,
  data: /node_modules[\\/](@tanstack|axios)[\\/]/,
  forms: /node_modules[\\/](react-hook-form|@hookform|zod)[\\/]/,
  icons: /node_modules[\\/]lucide-react[\\/]/,
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: Object.entries(VENDOR_GROUPS).map(([name, test]) => ({
            name: `vendor-${name}`,
            test,
          })),
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3002',
    },
  },
});
