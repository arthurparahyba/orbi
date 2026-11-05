import { flue } from '@flue/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  // Only the Anthropic provider ships in the build (Claude Haiku 5.5).
  plugins: [flue({ providers: ['anthropic'] })],
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
});
