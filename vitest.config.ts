import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      "@": "/Users/mac/Documents/Codex/2026-07-09/ni/qikuku"
},
  },
  test: {
    globals: true,
  },
});
