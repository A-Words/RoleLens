<script setup lang="ts">
const route = useRoute()
const open = ref(false)
watch(
  () => route.path,
  () => {
    open.value = false
  },
)
const items = computed(() => [
  { label: '求职工作台', type: 'label' as const },
  { label: '资料库', icon: 'i-lucide-folder-open', to: '/', active: route.path === '/' },
  {
    label: '职位工作台',
    icon: 'i-lucide-briefcase-business',
    to: '/jobs',
    active: route.path.startsWith('/jobs'),
  },
])
const preferences = computed(() => [
  { label: '偏好与配置', type: 'label' as const },
  { label: '设置', icon: 'i-lucide-settings', to: '/settings', active: route.path === '/settings' },
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
        root: 'bg-muted/60',
        header: 'border-b border-default',
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
      <UNavigationMenu
        :items="items"
        color="neutral"
        orientation="vertical"
        class="w-full pt-3"
        :ui="{ label: 'text-muted font-medium' }"
      />
      <UNavigationMenu
        :items="preferences"
        color="neutral"
        orientation="vertical"
        class="w-full"
        :ui="{ label: 'text-muted font-medium' }"
      />
    </UDashboardSidebar>
    <slot />
  </UDashboardGroup>
</template>
