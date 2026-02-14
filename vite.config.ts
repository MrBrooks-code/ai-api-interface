import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import electronRenderer from 'vite-plugin-electron-renderer';
import path from 'path';

const root = path.resolve(__dirname, 'src/renderer');

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production';
  return {
  plugins: [
    react(),
    electron([
      {
        entry: path.resolve(__dirname, 'src/main/index.ts'),
        vite: {
          build: {
            sourcemap: !isProduction,
            outDir: path.resolve(__dirname, 'dist-electron/main'),
            rollupOptions: {
              external: ['better-sqlite3-multiple-ciphers'],
            },
          },
          resolve: {
            alias: {
              '@shared': path.resolve(__dirname, 'src/shared'),
            },
          },
        },
      },
      {
        entry: path.resolve(__dirname, 'src/preload/index.ts'),
        vite: {
          build: {
            sourcemap: !isProduction,
            outDir: path.resolve(__dirname, 'dist-electron/preload'),
          },
          resolve: {
            alias: {
              '@shared': path.resolve(__dirname, 'src/shared'),
            },
          },
        },
        onstart(args) {
          args.reload();
        },
      },
    ]),
    electronRenderer(),
  ],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  root,
  build: {
    sourcemap: !isProduction,
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  };
});
