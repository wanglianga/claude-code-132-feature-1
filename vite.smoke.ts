import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 冒烟测试专用：把完整应用打成单个 IIFE 文件，供 jsdom 执行
export default defineConfig({
  plugins: [vue()],
  define: {
    'process.env.NODE_ENV': '"production"',
    __VUE_OPTIONS_API__: 'true',
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
  },
  build: {
    outDir: 'smoke-dist',
    emptyOutDir: true,
    lib: {
      entry: 'src/main.ts',
      formats: ['iife'],
      name: 'SmokeApp',
      fileName: () => 'app.iife.js',
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
})
