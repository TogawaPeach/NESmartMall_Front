import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/auth'
import { configureAuth } from './api/http'

const app = createApp(App)

app.use(createPinia())
configureAuth(useAuthStore())
app.use(router)

app.mount('#app')
