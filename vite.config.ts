import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import electron from 'vite-plugin-electron';
import electronRenderer from 'vite-plugin-electron-renderer';
import { resolve } from 'path';

const alias = {
  '@renderer': resolve(__dirname, 'app/renderer'),
  '@main': resolve(__dirname, 'app/main'),
  '@shared': resolve(__dirname, 'app/shared'),
};

export default defineConfig(({ command }) => ({
  plugins: [
    vue({
      script: {
        defineModel: true,
        propsDestructure: true,
      },
    }),
    electron([
      {
        entry: 'app/main/main.ts',
        vite: {
          resolve: {
            alias,
          },
          build: {
            outDir: 'dist/main',
            sourcemap: true,
            rollupOptions: {
              external: [
                '@prisma/client',
                '.prisma/client/index.js',
                '.prisma/client/default',
                'playwright',
                '@playwright/test',
                'chromium-bidi',
                'chromium-bidi/lib/cjs/bidiMapper/BidiMapper',
                'chromium-bidi/lib/cjs/cdp/CdpConnection',
              ],
            },
          },
        },
      },
      {
        entry: 'app/main/preload.ts',
        vite: {
          resolve: {
            alias,
          },
          build: {
            outDir: 'dist/preload',
            sourcemap: true,
          },
        },
      },
    ]),
    electronRenderer(),
  ],
  resolve: {
    alias,
  },
  build: {
    outDir: 'dist/renderer',
    sourcemap: command === 'serve',
  },
  server: {
    port: 5173,
    strictPort: true,
  },
}));
