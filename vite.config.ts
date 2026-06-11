import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { resolve } from 'path'
import { cpSync, existsSync, mkdirSync } from 'fs'

// 复制 fingerprint-generator 的数据文件到 dist-electron/main/data_files
function copyFingerprintDataFiles(): import('vite').Plugin {
  return {
    name: 'copy-fingerprint-data-files',
    writeBundle() {
      const src = resolve(__dirname, 'node_modules/header-generator/data_files')
      const dst = resolve(__dirname, 'dist-electron/main/data_files')
      if (existsSync(src)) {
        if (!existsSync(dst)) mkdirSync(dst, { recursive: true })
        cpSync(src, dst, { recursive: true })
      }
    }
  }
}

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag === 'webview'
        }
      }
    }),
    electron([
      {
        entry: 'electron/main/index.ts',
        onstart(options) {
          options.startup()
        },
        vite: {
          plugins: [copyFingerprintDataFiles()],
          build: {
            outDir: 'dist-electron/main',
            rollupOptions: {
              external: ['electron', 'electron-store', 'win32-window', '.node', 'fingerprint-generator', 'better-sqlite3']
            }
          }
        }
      },
      {
        entry: 'electron/preload/index.ts',
        onstart(options) {
          options.reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron/preload'
          }
        }
      }
    ]),
    renderer()
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
