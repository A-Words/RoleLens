<script setup lang="ts">
import {
  settingsSchema,
  secretNames,
  type SettingsView,
  type SecretName,
  type Settings,
  type ConnectionTestResult,
} from '#shared/settings'
const { data, error, refresh } = await useFetch<SettingsView>('/api/settings')
const state = reactive(settingsSchema.parse(data.value?.settings ?? {}))
const colorMode = useColorMode()
const themes = [
  { value: 'system', label: '跟随系统', icon: 'i-lucide-monitor' },
  { value: 'light', label: '浅色', icon: 'i-lucide-sun' },
  { value: 'dark', label: '深色', icon: 'i-lucide-moon' },
]
const cardUi = { header: 'px-4 py-3 sm:px-5', body: 'p-4 sm:p-5' }
const keys = reactive<Record<SecretName, string>>({
  apiKey: '',
  langfusePublicKey: '',
  langfuseSecretKey: '',
})
const remove = reactive<Record<SecretName, boolean>>({
  apiKey: false,
  langfusePublicKey: false,
  langfuseSecretKey: false,
})
const busy = ref(false)
const message = ref('')
const saveFailed = ref(false)
const testing = ref(false)
const connection = ref<ConnectionTestResult | null>(null)
const modelDirty = computed(
  () =>
    (['provider', 'baseUrl', 'model', 'protocol'] as const).some(
      (name) => state[name] !== data.value?.settings[name],
    ) ||
    !!keys.apiKey.trim() ||
    remove.apiKey,
)
watch(
  [state, () => keys.apiKey, () => remove.apiKey, () => data.value],
  () => {
    connection.value = null
  },
  { deep: true },
)
async function checkConnection() {
  if (testing.value || busy.value || modelDirty.value) return
  testing.value = true
  connection.value = null
  try {
    connection.value = await $fetch<ConnectionTestResult>('/api/settings/test-connection', {
      method: 'POST',
    })
  } catch {
    connection.value = {
      ok: false,
      message: '测试未完成，请检查本地服务是否正常后重试。',
      durationMs: 0,
    }
  } finally {
    testing.value = false
  }
}
function isEnv(name: string) {
  return data.value?.overrides.includes(name) ?? false
}
function fieldHelp(name: string, fallback = '') {
  const isSecret = secretNames.includes(name as SecretName)
  const status = isSecret ? (data.value?.secrets[name as SecretName] ? '已配置。' : '未配置。') : ''
  const secretStatus = isSecret ? (name === 'apiKey' ? 'API Key ' : '当前密钥') + status : ''
  const effective = data.value?.effectiveSettings[name as keyof Settings]
  const effectiveText = typeof effective === 'boolean' ? (effective ? '启用' : '停用') : effective
  return (
    secretStatus +
    (isEnv(name)
      ? (isSecret ? '当前使用 ENV 密钥。' : `当前生效（ENV）：${effectiveText ?? '未提供'}。`) +
        '输入框为本地备用值；移除 ENV 并重启后生效。'
      : fallback)
  )
}
async function save() {
  busy.value = true
  message.value = ''
  saveFailed.value = false
  try {
    await $fetch('/api/settings', {
      method: 'PUT',
      body: {
        ...state,
        ...Object.fromEntries(
          secretNames.map((name) => [name, remove[name] ? null : keys[name].trim() || undefined]),
        ),
      },
    })
    await refresh()
    await refreshNuxtData('model-status')
    message.value =
      '已保存本地配置。模型设置用于下一次任务；ENV 接管项仍以环境变量为准，开发追踪变更需重启。'
    for (const name of secretNames) {
      remove[name] = false
      keys[name] = ''
    }
  } catch {
    saveFailed.value = true
    message.value = '保存未完成，输入已保留。请检查字段和本地数据目录权限后重试。'
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <WorkspacePage title="设置" description="调整外观、模型连接与本地数据偏好。" compact>
    <UCard :ui="cardUi">
      <template #header><h2 class="text-sm font-semibold text-highlighted">外观</h2></template>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-muted">跟随系统明暗变化，或固定主题。选择立即生效。</p>
        <ClientOnly>
          <URadioGroup
            v-model="colorMode.preference"
            :items="themes"
            orientation="horizontal"
            variant="card"
            indicator="hidden"
            color="neutral"
            size="sm"
            aria-label="外观主题"
          />
          <template #fallback><USkeleton class="h-9 w-64" /></template>
        </ClientOnly></div
    ></UCard>
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      title="无法读取设置"
      description="请检查启动配置及本地数据目录。"
    />
    <UForm
      v-else-if="data"
      :schema="settingsSchema"
      :state="state"
      class="space-y-4"
      @submit="save"
    >
      <UCard :ui="cardUi">
        <template #header
          ><div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="text-sm font-semibold text-highlighted">模型与服务</h2>
            <div class="flex flex-wrap items-center gap-2" role="status">
              <UBadge
                :label="data.configured ? '配置完整' : '待补全配置'"
                color="neutral"
                variant="soft"
                size="sm"
              />
            </div></div
        ></template>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="LLM Provider" name="provider" :help="fieldHelp('provider', '')"
            ><template v-if="isEnv('provider')" #hint
              ><UBadge label="ENV 接管" color="neutral" variant="soft" size="sm" /></template
            ><USelect
              v-model="state.provider"
              :items="['openai', 'openai-compatible']"
              :disabled="busy || testing"
              class="w-full"
          /></UFormField>
          <UFormField label="Model" name="model" :help="fieldHelp('model', '')"
            ><template v-if="isEnv('model')" #hint
              ><UBadge label="ENV 接管" color="neutral" variant="soft" size="sm" /></template
            ><UInput
              v-model="state.model"
              aria-label="Model"
              :disabled="busy || testing"
              class="w-full"
          /></UFormField>
          <UFormField
            label="Base URL"
            name="baseUrl"
            :help="fieldHelp('baseUrl', 'API 根地址，例如 https://api.openai.com/v1。')"
            ><template v-if="isEnv('baseUrl')" #hint
              ><UBadge label="ENV 接管" color="neutral" variant="soft" size="sm" /></template
            ><UInput
              v-model="state.baseUrl"
              aria-label="Base URL"
              :disabled="busy || testing"
              class="w-full"
          /></UFormField>
          <UFormField label="Protocol" name="protocol" :help="fieldHelp('protocol', '')"
            ><template v-if="isEnv('protocol')" #hint
              ><UBadge label="ENV 接管" color="neutral" variant="soft" size="sm" /></template
            ><USelect
              v-model="state.protocol"
              :items="['chat-completions', 'responses']"
              :disabled="busy || testing"
              class="w-full"
          /></UFormField>
          <div class="sm:col-span-2">
            <UFormField label="API Key" name="apiKey" :help="fieldHelp('apiKey', '')"
              ><template v-if="isEnv('apiKey')" #hint
                ><UBadge label="ENV 接管" color="neutral" variant="soft" size="sm" /></template
              ><UInput
                v-model="keys.apiKey"
                aria-label="API Key"
                type="password"
                autocomplete="new-password"
                :disabled="busy || testing || remove.apiKey"
                placeholder="留空保留，输入替换"
                class="w-full" /><UCheckbox
                v-model="remove.apiKey"
                label="删除本地保存的密钥"
                :disabled="busy || testing"
                class="mt-2"
            /></UFormField>
          </div>
        </div>
        <div class="mt-4 flex flex-wrap items-center gap-3">
          <UButton
            type="button"
            label="测试当前连接"
            color="neutral"
            variant="outline"
            icon="i-lucide-plug"
            :loading="testing"
            :disabled="busy || modelDirty || !data.configured"
            @click="checkConnection"
          />
          <p class="text-xs text-muted">
            {{
              modelDirty
                ? '模型配置有未保存修改，请先保存再测试。'
                : '测试当前生效配置，发送一条简短消息，不包含个人资料。'
            }}
          </p>
        </div>
        <p v-if="!connection && !testing" class="mt-2 text-xs text-muted">连接未验证</p>
        <p
          v-if="connection"
          role="status"
          class="mt-2 text-sm"
          :class="connection.ok ? 'text-toned' : 'text-error'"
        >
          {{ connection.message
          }}<span v-if="connection.ok" class="ml-2 text-xs text-muted"
            >{{ connection.durationMs }} ms · 仅验证基础请求，不代表完整 Agent 流程。</span
          >
        </p>
      </UCard>
      <UCard :ui="cardUi">
        <template #header
          ><div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="text-sm font-semibold text-highlighted">开发工具</h2>
            <UBadge
              :label="data.langfuseAvailable ? '开发环境允许追踪' : '当前环境不启用追踪'"
              color="neutral"
              variant="soft"
              size="sm"
            /></div
        ></template>
        <div class="space-y-4">
          <UFormField
            label="Langfuse tracing"
            name="langfuseEnabled"
            :help="
              fieldHelp(
                'langfuseEnabled',
                '仅开发环境生效；配置变更需重启。未启用或不可用时不影响模型任务。',
              )
            "
            ><template v-if="isEnv('langfuseEnabled')" #hint
              ><UBadge label="ENV 接管" color="neutral" variant="soft" size="sm" /></template
            ><USwitch
              v-model="state.langfuseEnabled"
              label="启用开发追踪"
              :disabled="busy || testing"
          /></UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="sm:col-span-2">
              <UFormField
                label="Langfuse Base URL"
                name="langfuseBaseUrl"
                :help="fieldHelp('langfuseBaseUrl', '')"
                ><template v-if="isEnv('langfuseBaseUrl')" #hint
                  ><UBadge label="ENV 接管" color="neutral" variant="soft" size="sm" /></template
                ><UInput
                  v-model="state.langfuseBaseUrl"
                  aria-label="Langfuse Base URL"
                  :disabled="busy || testing"
                  class="w-full"
              /></UFormField>
            </div>
            <UFormField
              label="Langfuse Public Key"
              name="langfusePublicKey"
              :help="fieldHelp('langfusePublicKey', '')"
              ><template v-if="isEnv('langfusePublicKey')" #hint
                ><UBadge label="ENV 接管" color="neutral" variant="soft" size="sm" /></template
              ><UInput
                v-model="keys.langfusePublicKey"
                aria-label="Langfuse Public Key"
                type="password"
                autocomplete="new-password"
                :disabled="busy || testing || remove.langfusePublicKey"
                placeholder="留空保留，输入替换"
                class="w-full" /><UCheckbox
                v-model="remove.langfusePublicKey"
                label="删除本地保存的密钥"
                :disabled="busy || testing"
                class="mt-2"
            /></UFormField>
            <UFormField
              label="Langfuse Secret Key"
              name="langfuseSecretKey"
              :help="fieldHelp('langfuseSecretKey', '')"
              ><template v-if="isEnv('langfuseSecretKey')" #hint
                ><UBadge label="ENV 接管" color="neutral" variant="soft" size="sm" /></template
              ><UInput
                v-model="keys.langfuseSecretKey"
                aria-label="Langfuse Secret Key"
                type="password"
                autocomplete="new-password"
                :disabled="busy || testing || remove.langfuseSecretKey"
                placeholder="留空保留，输入替换"
                class="w-full" /><UCheckbox
                v-model="remove.langfuseSecretKey"
                label="删除本地保存的密钥"
                :disabled="busy || testing"
                class="mt-2"
            /></UFormField>
          </div></div
      ></UCard>
      <div class="flex flex-wrap items-center gap-3">
        <UButton type="submit" :disabled="testing" :loading="busy" label="保存设置" />
        <p class="text-xs text-muted">保存模型与开发工具配置；外观无需保存。</p>
      </div>
      <UAlert
        v-if="message"
        :color="saveFailed ? 'error' : 'neutral'"
        variant="subtle"
        :description="message"
        :role="saveFailed ? 'alert' : 'status'"
      />
    </UForm>
    <UCard :ui="cardUi">
      <template #header
        ><h2 class="text-sm font-semibold text-highlighted">数据与隐私</h2></template
      >
      <p class="mb-3 text-sm text-muted">本地优先：资料与配置保存在运行 RoleLens 的这台设备。</p>
      <dl class="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <div>
          <dt class="font-medium text-default">数据位置</dt>
          <dd class="mt-1 leading-6 text-muted">
            默认位于启动目录的 <code>.data</code>；设置
            <code>ROLELENS_DATA_DIR</code> 时使用指定目录。
          </dd>
        </div>
        <div>
          <dt class="font-medium text-default">模型与追踪</dt>
          <dd class="mt-1 leading-6 text-muted">
            模型任务会发送相关资料至配置的服务。启用 Langfuse 后，任务内容也可能发送至追踪服务。
          </dd>
        </div>
        <div class="sm:col-span-2">
          <dt class="font-medium text-default">密钥与备份</dt>
          <dd class="mt-1 leading-6 text-muted">
            本地保存的密钥包含在数据目录中，页面不回显密钥。备份前请停止应用并妥善保管副本；ENV
            密钥需另行管理。
          </dd>
        </div>
      </dl></UCard
    >
  </WorkspacePage>
</template>
