import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_PROXY_TARGET || 'http://172.16.2.91:8000'
  const doodleProxyTarget = env.VITE_DOODLE_PROXY_TARGET || 'http://172.16.2.91:8000'
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api/v1/doodles': {
          target: doodleProxyTarget,
          changeOrigin: true,
        },
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
