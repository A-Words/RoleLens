<script setup lang="ts">
import { Files, FolderOpen, BriefcaseBusiness, HardDrive } from 'lucide-vue-next'
const { data: status } = await useFetch<{ configured: boolean; revision: number }>('/api/status')
</script>
<template>
  <div class="workspace">
    <aside class="sidebar">
      <NuxtLink to="/" class="brand"><Files :size="30" /><span>RoleLens</span></NuxtLink>
      <nav aria-label="主导航">
        <NuxtLink to="/" :class="{ active: $route.path === '/' }"
          ><FolderOpen :size="20" />资料库</NuxtLink
        >
        <NuxtLink to="/jobs" :class="{ active: $route.path.startsWith('/jobs') }"
          ><BriefcaseBusiness :size="20" />职位工作台</NuxtLink
        >
      </nav>
      <div class="local"><HardDrive :size="18" /><span>本地工作空间</span></div>
    </aside>
    <main>
      <div v-if="status && !status.configured" class="notice">
        尚未连接模型。在本机 .env 配置 API
        密钥和模型后重启，即可整理资料和分析职位。你仍可手动建立档案。
      </div>
      <slot />
    </main>
  </div>
</template>
