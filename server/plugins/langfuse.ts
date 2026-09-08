import { deploymentMode } from '../core/runtime-config'
import { shutdownLangfuse } from '../core/langfuse'

export default defineNitroPlugin((nitroApp) => {
  deploymentMode()
  nitroApp.hooks.hook('close', shutdownLangfuse)
})
