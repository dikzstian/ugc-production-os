import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: false,
    watch: {
      ignored: ['**/data/**', '**/dist/**', '**/.npm-cache/**'],
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3010',
        changeOrigin: true,
      },
      '/media': {
        target: 'http://127.0.0.1:3010',
        changeOrigin: true,
      },
    },
  },
});
