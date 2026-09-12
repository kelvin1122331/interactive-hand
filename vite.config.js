import { defineConfig } from 'vite';

// HMR_CLIENT_PORT dipakai saat dev server berjalan di balik proxy HTTPS
// (mis. preview environment). Kosongkan saat menjalankan `npm run dev` lokal.
const hmrClientPort = process.env.HMR_CLIENT_PORT ? Number(process.env.HMR_CLIENT_PORT) : undefined;

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // Izinkan host preview manapun (e2b.dev, dsb.)
    allowedHosts: true,
    hmr: hmrClientPort ? { clientPort: hmrClientPort, protocol: 'wss' } : undefined
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600
  }
});
