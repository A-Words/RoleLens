<script setup lang="ts">
import { settingsSchema, secretNames, type SettingsView, type SecretName } from '#shared/settings'

const { data, error, refresh } = await useFetch<SettingsView>('/api/settings')
const state = reactive(settingsSchema.parse(data.value?.settings ?? {}))
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
async function save() {
  busy.value = true
  message.value = ''
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
    message.value = '已保存。模型配置用于下一次任务；Langfuse 配置变更需重启应用。'
    for (const name of secretNames) remove[name] = false
  } catch {
    message.value = '保存未完成，请检查字段、环境 override 和本地数据目录权限后重试。'
  } finally {
    for (const name of secretNames) keys[name] = ''
    busy.value = false
  }
}
</script>

<template>
  <WorkspacePage title="设置" description="Local Mode · 单用户 · 本地存储 · 无需账号">
    <UAlert
      v-if="error"
      color="error"
      title="无法读取设置"
      description="请检查启动配置及本地数据目录。"
    />
    <template v-else-if="data">
      <UAlert
        title="本地优先"
        description="模型请求由本机服务端发送。密钥保存在本地数据目录，页面仅显示配置状态；备份数据目录也会包含密钥。Hosted Mode 尚未实现。"
      />
      <UAlert
        v-if="data.overrides.length"
        color="warning"
        title="环境变量正在覆盖配置"
        :description="`以下字段以环境变量为准：${data.overrides.join('、')}。下方显示本地保存值；移除对应 override 并重启后生效。`"
      />
      <UForm :schema="settingsSchema" :state="state" class="max-w-2xl space-y-5" @submit="save">
        <UFormField
          label="LLM Provider"
          name="provider"
          description="当前支持 OpenAI 及 OpenAI-compatible 服务。"
        >
          <USelect
            v-model="state.provider"
            :items="['openai', 'openai-compatible']"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Base URL"
          name="baseUrl"
          description="填写 API 根地址，例如 https://api.openai.com/v1。"
        >
          <UInput v-model="state.baseUrl" aria-label="Base URL" class="w-full" />
        </UFormField>
        <UFormField label="Model" name="model"
          ><UInput v-model="state.model" aria-label="Model" class="w-full"
        /></UFormField>
        <UFormField label="Protocol" name="protocol"
          ><USelect
            v-model="state.protocol"
            :items="['chat-completions', 'responses']"
            class="w-full"
        /></UFormField>
        <UFormField label="Langfuse（可选）" name="langfuseEnabled">
          <USwitch v-model="state.langfuseEnabled" label="启用开发追踪" />
        </UFormField>
        <p class="text-sm text-muted">
          追踪可能发送任务内容到 Langfuse。仅开发运行时启用；未配置或不可用不影响任务。{{
            data.langfuseAvailable ? '当前允许开发追踪。' : '当前运行环境不启用开发追踪。'
          }}
        </p>
        <UFormField label="Langfuse Base URL" name="langfuseBaseUrl"
          ><UInput v-model="state.langfuseBaseUrl" aria-label="Langfuse Base URL" class="w-full"
        /></UFormField>
        <UFormField
          v-for="name in secretNames"
          :key="name"
          :label="name"
          :name="name"
          :description="`${data.secrets[name] ? '已配置' : '未配置'}；留空保留，输入替换。`"
        >
          <UInput
            v-model="keys[name]"
            :aria-label="name"
            type="password"
            autocomplete="new-password"
            :disabled="remove[name]"
            class="w-full"
          />
          <UCheckbox v-model="remove[name]" label="删除已保存密钥" class="mt-2" />
        </UFormField>
        <UButton type="submit" :loading="busy">保存设置</UButton>
        <p v-if="message" role="status" class="text-sm">{{ message }}</p>
      </UForm>
    </template>
  </WorkspacePage>
</template>
