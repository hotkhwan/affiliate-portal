export default defineNuxtConfig({
  compatibilityDate: '2026-07-01',
  devServer: {
    host: '0.0.0.0',
    port: 3000,
  },
  devtools: { enabled: false },
  modules: ['@nuxt/eslint'],
  runtimeConfig: {
    public: {
      appVersion: process.env.NUXT_PUBLIC_APP_VERSION || '0.0.0-dev',
      commitSha: process.env.NUXT_PUBLIC_COMMIT_SHA || 'local',
      missionApiBase: process.env.NUXT_PUBLIC_MISSION_API_BASE || '/dev/llm-api/v1',
    },
  },
  typescript: {
    strict: true,
  },
  app: {
    head: {
      title: 'KWANNI — เริ่ม Affiliate แบบทีละขั้น',
      meta: [
        { name: 'theme-color', content: '#1f6b4f' },
        { name: 'description', content: 'เลือกสินค้า ถ่าย 3 ช็อต และเตรียม Affiliate Post แรกแบบทีละขั้น' },
      ],
      link: [
        { rel: 'manifest', href: 'manifest.webmanifest' },
        { rel: 'icon', href: 'kwanni-icon.svg', type: 'image/svg+xml' },
      ],
    },
  },
})
