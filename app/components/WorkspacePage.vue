<script setup lang="ts">
defineProps<{ title: string; description?: string; back?: boolean; compact?: boolean }>()
const { data: status } = await useFetch<{ configured: boolean }>('/api/status', {
  key: 'model-status',
})
</script>
<template>
  <UDashboardPanel :ui="{ body: 'gap-6 bg-muted/35 sm:p-8' }">
    <template #header>
      <UDashboardNavbar :title="title" :toggle="{ label: '导航' }">
        <template v-if="description && !compact" #left>
          <UButton
            v-if="back"
            to="/jobs"
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            aria-label="返回职位列表"
          />
          <span class="text-sm font-medium text-muted">{{ title }}</span>
        </template>
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
      ><div class="mx-auto w-full" :class="compact ? 'max-w-5xl space-y-4' : 'max-w-7xl space-y-6'">
        <UAlert
          v-if="!compact && status && !status.configured"
          icon="i-lucide-unplug"
          color="warning"
          variant="subtle"
          title="尚未连接模型"
          description="请前往设置页面配置 API 密钥和模型。你可以先手动建立档案。"
        >
          <template #actions
            ><UButton to="/settings" label="配置模型" color="warning" variant="outline"
          /></template>
        </UAlert>
        <p v-if="compact && description" class="text-sm text-muted">{{ description }}</p>
        <div v-else-if="description" class="border-b border-default pb-5">
          <p class="mb-2 text-xs font-semibold tracking-widest text-primary">ROLELENS / 工作空间</p>
          <h1 class="text-2xl font-semibold tracking-tight text-highlighted">{{ title }}</h1>
          <p class="mt-2 text-sm leading-7 text-muted">{{ description }}</p>
        </div>
        <slot /></div
    ></template>
  </UDashboardPanel>
</template>
