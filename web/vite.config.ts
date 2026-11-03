import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

const backendPort = process.env.VITE_BACKEND_PORT || process.env.PORT || '1234';

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    target: 'esnext',
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000000,
    cssCodeSplit: false,
  },
  server: {
    proxy: {
      '/api': `http://127.0.0.1:${backendPort}`,
      '/sub': `http://127.0.0.1:${backendPort}`,
    },
  },
});
