import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('firebase')) return 'firebase';
            if (id.includes('@tabler/icons') || id.includes('react-icons')) return 'icons';
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) return 'vendor';
            return 'core'; // Other node modules
          }
        }
      }
    }
  }
})
