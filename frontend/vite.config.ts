import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  // 加载当前模式对应的环境变量文件
  // mode = 'development' | 'production'（由 --mode 参数决定）
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [vue()],
    // 部署基础路径：'/' 表示部署在域名的根路径
    // 如果部署在子路径（如 /app/），需要改为 '/app/'
    base: '/',
    server: {
      port: 1016,
      // 开发环境代理配置：将 /api 请求代理到后端服务器
      // 这样前端在开发时可以直接请求 /api/xxx，无需处理跨域
      proxy: {
        '/api': {
          target: env.VITE_API_BASE_URL || 'http://localhost:3000',
          changeOrigin: true,
          bypass(req, res) {
            // SSE 流式响应需要禁用 Nginx 缓冲
            if (req.url?.includes('/stream') && res) {
              res.setHeader('X-Accel-Buffering', 'no')
            }
          },
        },
      },
    },
    build: {
      // 生产构建时输出目录
      outDir: 'dist',
      // 关闭 Source Map 以减小产物大小（生产环境）
      sourcemap: false,
    },
  }
})
