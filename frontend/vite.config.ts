import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/ma-app/', // กำหนด base path
  server: {
    host: '0.0.0.0', // Allow connections from outside container
    port: 5173, // Default Vite port
    allowedHosts: ['conic.myds.me'],
  }
});
