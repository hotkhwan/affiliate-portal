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
    },
  },
  typescript: {
    strict: true,
  },
})
