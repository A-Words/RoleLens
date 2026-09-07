import { shutdownLangfuse } from '../core/langfuse'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('close', shutdownLangfuse)
})
