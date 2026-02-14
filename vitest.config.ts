/**
 * @fileoverview Vitest configuration. Uses the Node environment for testing
 * main-process and shared modules.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
});
