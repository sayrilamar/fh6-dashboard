import { defineConfig } from 'vitest/config';

// Unit tests only. End-to-end tests get their own runner (Playwright) and folder, so
// keep this include narrow enough that Vitest never picks those up.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
  },
});
