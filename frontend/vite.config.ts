import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_PROXY_TARGET || 'http://127.0.0.1:8001'
  const doodleProxyTarget = env.VITE_DOODLE_PROXY_TARGET || 'http://127.0.0.1:8001'
  return {
    plugins: [react()],
    server: {
      // 本机开发固定使用 5174，避免误连旧的 5173 前端进程。
      port: 5174,
      strictPort: true,
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
