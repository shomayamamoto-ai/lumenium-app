import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { compression } from 'vite-plugin-compression2'
import { minify as htmlMinify } from 'html-minifier-terser'

// Minify the generated index.html (Vite does not minify HTML entry by default).
const htmlMinifierPlugin = () => ({
  name: 'html-minifier',
  apply: 'build',
  enforce: 'post',
  async transformIndexHtml(html) {
    return htmlMinify(html, {
      collapseWhitespace: true,
      conservativeCollapse: false,
      removeComments: true,
      removeRedundantAttributes: true,
      removeScriptTypeAttributes: true,
      removeStyleLinkTypeAttributes: true,
      useShortDoctype: true,
      minifyCSS: true,
      minifyJS: { compress: { drop_console: false, drop_debugger: true, passes: 2 }, mangle: true, format: { comments: false } },
      sortAttributes: true,
      sortClassName: true,
    })
  },
})

export default defineConfig({
  plugins: [
    react(),
    htmlMinifierPlugin(),
    compression({
      algorithm: 'brotliCompress',
      exclude: [/\.(br|gz)$/, /\.(png|jpe?g|webp|avif|mp4|woff2?)$/i],
      threshold: 1024,
    }),
    compression({
      algorithm: 'gzip',
      exclude: [/\.(br|gz)$/, /\.(png|jpe?g|webp|avif|mp4|woff2?)$/i],
      threshold: 1024,
    }),
  ],
  server: {
    port: 5180,
  },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    sourcemap: false,
    minify: 'terser',
    cssMinify: 'lightningcss',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        passes: 2,
      },
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('scheduler')) return 'react-vendor'
            if (id.includes('@vercel/speed-insights')) return 'speed-insights'
          }
        },
      },
    },
  },
})
