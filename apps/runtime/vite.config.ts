import { flue } from '@flue/vite';
import { defineConfig } from 'vite';

// @orbi/contracts (packages/contracts) is TypeScript source shared with the app.
// It is deliberately NOT in this package's dependencies: Flue externalizes every
// declared dependency, and Node can't run .ts from node_modules. Undeclared, it
// resolves through the workspace link and is bundled into dist/.
export default defineConfig({
  // Only the Anthropic provider ships in the build (Claude Haiku 5.5).
  plugins: [flue({ providers: ['anthropic'] })],
  // Build stamp (scripts/build-app.mjs), compared by the app with its own: see /api/health.
  define: { __ORBI_BUILD__: JSON.stringify(process.env.ORBI_BUILD ?? 'dev') },
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
});
