import { defineConfig } from 'vite';
import path from 'node:path';
import { builtinModules } from 'node:module';

export default defineConfig({
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/preload'),
    emptyOutDir: true,
    target: 'node20',
    ssr: true,
    lib: {
      entry: path.resolve(import.meta.dirname, 'src/preload/index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.cjs',
    },
    rollupOptions: {
      external: [
        'electron',
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
      ],
      output: {
        format: 'cjs',
        entryFileNames: 'index.cjs',
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
});
