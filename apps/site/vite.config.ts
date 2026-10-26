import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Publicado no GitHub Pages do repositório público de distribuição: https://dracon-46.github.io/ascend/
export default defineConfig({
  base: process.env.SITE_BASE ?? '/ascend/',
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // Bibliotecas em arquivos próprios: baixam em paralelo e ficam em cache entre versões do site.
        manualChunks: {
          react: ['react', 'react-dom', 'react-dom/client'],
          motion: ['motion/react'],
          gsap: ['gsap', 'gsap/ScrollTrigger', '@gsap/react', 'lenis'],
        },
      },
    },
  },
});
