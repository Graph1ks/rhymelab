import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/studio-react/',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    allowedHosts: ['localhost', '127.0.0.1'],
    cors: false,
    fs: {
      strict: true,
      allow: ['../..'],
      deny: [
        '.env',
        '.env.*',
        '*.{crt,pem}',
        '**/.git/**',
        '**/data/**',
        '**/reports/**',
        '**/*.sqlite',
        '**/*.sqlite-*',
        '**/*.db',
      ],
    },
    proxy: {
      '/api': 'http://127.0.0.1:3030',
    },
  },
  preview: {
    host: '127.0.0.1',
    allowedHosts: ['localhost', '127.0.0.1'],
    cors: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    emptyOutDir: true,
    license: {
      fileName: 'third-party-licenses.md',
    },
  },
});
