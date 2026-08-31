import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  base: '/ma-app/',

  server: {
    host: '0.0.0.0',
    port: 3333,
    strictPort: true,
    allowedHosts: ['conic.ddns.net'],
  },
});