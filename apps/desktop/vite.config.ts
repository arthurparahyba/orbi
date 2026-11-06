import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development the UI is served by Vite and proxies the runtime, so the
// browser (or the Tauri dev webview) talks to one origin.
const runtime = process.env.ORBI_RUNTIME_URL ?? 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    proxy: { '/api': runtime, '/agents': runtime },
  },
  build: { target: 'es2022', outDir: 'dist' },
});
