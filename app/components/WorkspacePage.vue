<script setup lang="ts">
defineProps<{ title: string; description?: string; back?: boolean }>()
const { data: status } = await useFetch<{ configured: boolean }>('/api/status', {
  key: 'model-status',
})
</script>
<template>
  <UDashboardPanel :ui="{ body: 'gap-6' }">
    <template #header>
      <UDashboardNavbar :title="title" :toggle="{ label: '导航' }">
        <template v-if="back" #leading
          ><UButton
            to="/jobs"
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            aria-label="返回职位列表"
        /></template>
        <template #right><slot name="actions" /></template>
      </UDashboardNavbar>
      <UDashboardToolbar v-if="$slots.toolbar"><slot name="toolbar" /></UDashboardToolbar>
    </template>
    <template #body
      ><div class="mx-auto w-full max-w-7xl space-y-6">
        <UAlert
          v-if="status && !status.configured"
          icon="i-lucide-unplug"
          color="warning"
          variant="subtle"
          title="尚未连接模型"
          description="在本机 .env 配置 API 密钥和模型后重启。你可以先手动建立档案。"
        />
        <p v-if="description" class="text-sm text-muted">{{ description }}</p>
        <slot /></div
    ></template>
  </UDashboardPanel>
</template>
