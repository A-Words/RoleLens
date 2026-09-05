export default defineNuxtConfig({
  compatibilityDate: '2026-09-05',
  devtools: { enabled: false },
  css: [
    '@fontsource/noto-sans-sc/400.css',
    '@fontsource/noto-sans-sc/600.css',
    '~/assets/main.css',
  ],
  app: { head: { title: 'RoleLens · 个人求职工作台', htmlAttrs: { lang: 'zh-CN' } } },
  nitro: {
    preset: 'node-server',
    externals: { external: ['better-sqlite3', 'playwright', 'pdf-parse'] },
  },
})
