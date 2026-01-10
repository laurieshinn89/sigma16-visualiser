import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/sigma16-visualiser/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': '/src',
      '@logic': '/src/logic',
      '@components': '/src/components',
      '@hooks': '/src/hooks',
      '@utils': '/src/utils'
    }
  }
})
