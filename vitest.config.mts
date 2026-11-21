import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const reactNativeMockPath = fileURLToPath(
  new URL('./apps/client/tests/mocks/react-native.ts', import.meta.url),
);

export default defineConfig({
  resolve: {
    alias: {
      'react-native': reactNativeMockPath,
    },
  },
  test: {
    include: ['apps/**/tests/**/*.test.{ts,tsx}', 'packages/**/tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./apps/client/tests/mocks/setup-react-native.ts'],
  },
});
