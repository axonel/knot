import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    globals: true,
    projects: [
      {
        plugins: [react()],
        resolve: {
          alias: {
            '@': path.resolve(import.meta.dirname, 'src'),
          },
        },
        test: {
          name: 'ui',
          globals: true,
          environment: 'jsdom',
          setupFiles: ['./tests/setup.ts'],
          include: ['tests/**/*.test.tsx'],
        },
      },
      {
        resolve: {
          alias: {
            '@': path.resolve(import.meta.dirname, 'src'),
          },
        },
        test: {
          name: 'node',
          globals: true,
          environment: 'node',
          setupFiles: ['./tests/setup.ts'],
          include: ['tests/**/*.test.ts'],
        },
      },
    ],
  },
});
