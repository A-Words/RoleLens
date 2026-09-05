<script setup lang="ts">
const route = useRoute()
const open = ref(false)
const items = computed(() => [
  { label: '资料库', icon: 'i-lucide-folder-open', to: '/', active: route.path === '/' },
  {
    label: '职位工作台',
    icon: 'i-lucide-briefcase-business',
    to: '/jobs',
    active: route.path.startsWith('/jobs'),
  },
])
</script>
<template>
  <UDashboardGroup storage-key="rolelens-ui">
    <UDashboardSidebar
      v-model:open="open"
      :default-size="16"
      :min-size="14"
      :max-size="22"
      resizable
      :ui="{
        root: 'bg-elevated/40',
        header: 'border-b border-default',
        footer: 'border-t border-default',
      }"
    >
      <template #header
        ><NuxtLink
          to="/"
          class="flex items-center gap-2.5 px-2 text-lg font-semibold tracking-tight"
          aria-label="RoleLens 首页"
          ><UIcon name="i-lucide-scan-text" class="size-6 text-primary" />RoleLens</NuxtLink
        ></template
      >
      <div class="px-2 pt-5 pb-2 text-xs font-medium text-muted">个人求职工作台</div>
      <UNavigationMenu :items="items" orientation="vertical" class="w-full" />
      <template #footer
        ><div class="flex w-full items-center gap-2 px-2 py-3 text-xs text-muted">
          <UIcon name="i-lucide-hard-drive" class="size-4" />本地工作空间<UColorModeButton
            class="ml-auto"
            size="sm"
          /></div
      ></template>
    </UDashboardSidebar>
    <slot />
  </UDashboardGroup>
</template>
