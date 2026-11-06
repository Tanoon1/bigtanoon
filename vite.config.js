import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./client', import.meta.url));
export default defineConfig({
  root,
  publicDir: fileURLToPath(new URL('./client/public', import.meta.url)),
  server: {
    port: 5173,
    host: true,
    fs: { allow: [fileURLToPath(new URL('.', import.meta.url))] },
    proxy: { '/ws': { target: 'ws://localhost:3000', ws: true }, '/api': 'http://localhost:3000' },
  },
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: { output: { manualChunks: { three: ['three'], livekit: ['livekit-client'] } } },
  },
});
