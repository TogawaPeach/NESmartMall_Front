import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import { cartMockPlugin } from './dev/cartMock.ts'
import { orderMockPlugin } from './dev/orderMock.ts'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [
      vue(),
      vueJsx(),
      ...(command === 'serve' && mode !== 'production' && env.VITE_CART_MOCK === 'true'
        ? [cartMockPlugin(env.VITE_CART_MOCK_SCENARIO || 'mixed')]
        : []),
      ...(command === 'serve' && mode !== 'production' && env.VITE_ORDER_MOCK === 'true'
        ? [
            orderMockPlugin(env.VITE_ORDER_MOCK_SCENARIO || 'normal', {
              transactions: env.VITE_CART_MOCK === 'true',
            }),
          ]
        : []),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:8080',
          changeOrigin: true,
        },
      },
    },
  }
})
