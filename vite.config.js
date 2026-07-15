import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/ue-words/' : '/',
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: assetInfo => assetInfo.names?.some(name => name.endsWith('.css'))
          ? 'assets/app.css'
          : 'assets/[name][extname]',
      },
    },
  },
});
