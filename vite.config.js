import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['tesseract.js']
  },
  server: {
    headers: {
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    },
    proxy: {
      // ── NVIDIA NIM — proxied to bypass CORS ──
      '/api/nvidia': {
        target: 'https://integrate.api.nvidia.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/nvidia/, '/v1'),
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.error('[NVIDIA Proxy Error]', err.message);
          });
          proxy.on('proxyReq', (proxyReq, req) => {
            // Strip origin header so NVIDIA doesn't reject it
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('referer');
          });
        }
      },
      // ── Jina Search ──
      '/api/jina-s': {
        target: 'https://s.jina.ai',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/jina-s/, ''),
      },
      // ── Jina Reader ──
      '/api/jina-r': {
        target: 'https://r.jina.ai',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/jina-r/, ''),
      },
      // ── Unsplash (cover images) ──
      '/api/unsplash': {
        target: 'https://api.unsplash.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/unsplash/, ''),
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          pdf: ['jspdf', 'jspdf-autotable'],
          docx: ['docx', 'file-saver']
        }
      }
    }
  }
})