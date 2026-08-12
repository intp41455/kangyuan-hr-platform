import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 康源智慧人资平台 - Vite 配置
// 钉钉 H5 嵌入：默认端口 5173，允许任何 host 访问便于钉钉容器加载
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    open: false
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          antd: ['antd', '@ant-design/icons'],
          echarts: ['echarts', 'echarts-for-react']
        }
      }
    }
  }
})
