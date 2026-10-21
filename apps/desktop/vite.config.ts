import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_');
  return {
    base: env.VITE_BASE_PATH || '/',
    plugins: [react()],
    clearScreen: false,
    server: {
      host: '0.0.0.0', port: 1420, strictPort: true,
      allowedHosts: ['.sg2.manus.computer'],
    },
    envPrefix: ['VITE_', 'TAURI_ENV_*'],
    build: {
      target: ['es2022', 'chrome105', 'safari13'], minify: 'esbuild', sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('/node_modules/recharts/') || id.includes('/node_modules/d3-')) return 'charts-vendor';
            if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/') || id.includes('/node_modules/scheduler/')) return 'react-vendor';
          },
        },
      },
    },
  };
});
