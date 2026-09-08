<script setup lang="ts">
import { jobInput, type Job } from '#shared/types'
const { data: jobs } = await useFetch<Job[]>('/api/jobs')
const search = ref('')
const filteredJobs = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  return (jobs.value ?? []).filter((job) =>
    `${job.company} ${job.title} ${job.jd}`.toLocaleLowerCase().includes(query),
  )
})
const { busy, error, act } = useAction()
const creating = ref(false),
  form = reactive({ company: '', title: '', jd: '' })
function create() {
  return act(async () => {
    const j = await $fetch<Job>('/api/jobs', { method: 'POST', body: form })
    await navigateTo(`/jobs/${j.id}`)
  })
}
</script>
<template>
  <WorkspacePage title="职位工作台" description="保存感兴趣的岗位，用已有经历准备有针对性的表达。">
    <template #actions
      ><UButton label="添加职位" icon="i-lucide-plus" @click="creating = true"
    /></template>
    <template #toolbar>
      <div class="flex w-full flex-wrap items-center gap-3">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          aria-label="搜索职位"
          placeholder="搜索职位、公司或关键词…"
          class="w-full sm:max-w-sm"
        />
        <span class="text-xs text-muted" role="status">{{ filteredJobs.length }} 个职位</span>
        <UButton
          v-if="search"
          label="清除搜索"
          color="neutral"
          variant="ghost"
          size="sm"
          @click="search = ''"
        />
      </div>
    </template>
    <UEmpty
      v-if="!jobs?.length"
      icon="i-lucide-briefcase-business"
      title="下一份机会，从这里开始"
      description="粘贴一份 JD，让 Agent 找到相关经历、分析缺口并准备简历。"
      variant="subtle"
      class="py-20"
    >
      <template #actions
        ><UButton label="添加第一个职位" icon="i-lucide-plus" @click="creating = true"
      /></template>
    </UEmpty>
    <UEmpty
      v-else-if="!filteredJobs.length"
      icon="i-lucide-search"
      title="没有找到匹配职位"
      description="试试公司名称、职位名称，或清除搜索查看所有机会。"
    >
      <template #actions
        ><UButton label="查看所有职位" color="neutral" variant="outline" @click="search = ''"
      /></template>
    </UEmpty>
    <div v-else class="overflow-hidden rounded-xl border border-default bg-default">
      <div
        class="flex items-center justify-between border-b border-default bg-elevated/40 px-5 py-3"
      >
        <h2 class="text-sm font-medium">已保存职位</h2>
        <UBadge color="neutral" variant="subtle" :label="String(filteredJobs.length)" />
      </div>
      <div class="divide-y divide-default">
        <NuxtLink
          v-for="job in filteredJobs"
          :key="job.id"
          :to="'/jobs/' + job.id"
          class="group flex gap-4 p-5 transition-colors hover:bg-elevated/40 sm:p-6"
        >
          <div
            class="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
          >
            <UIcon name="i-lucide-building-2" class="size-5" />
          </div>
          <div class="min-w-0 flex-1">
            <h2 class="font-semibold text-highlighted group-hover:text-primary">{{ job.title }}</h2>
            <p class="mt-1 text-sm text-muted">{{ job.company }}</p>
            <p class="mt-3 line-clamp-2 whitespace-pre-wrap text-sm leading-6 text-toned">
              {{ job.jd }}
            </p>
            <p class="mt-3 text-xs text-muted">
              {{ new Date(job.createdAt).toLocaleDateString('zh-CN') }} 保存
            </p>
          </div>
          <UIcon
            name="i-lucide-arrow-up-right"
            class="mt-1 size-4 shrink-0 text-dimmed group-hover:text-primary"
          />
        </NuxtLink>
      </div>
    </div>
  </WorkspacePage>
  <ModalPanel
    v-if="creating"
    title="添加职位"
    description="填写公司和职位名称，再粘贴完整的岗位要求。"
    :busy="busy"
    @close="creating = false"
  >
    <UForm :schema="jobInput" :state="form" class="space-y-5" @submit="create">
      <div class="grid gap-5 sm:grid-cols-2">
        <UFormField label="公司" name="company" required
          ><UInput v-model="form.company" class="w-full" maxlength="120"
        /></UFormField>
        <UFormField label="职位名称" name="title" required
          ><UInput v-model="form.title" class="w-full" maxlength="120"
        /></UFormField>
      </div>
      <UFormField label="职位描述（JD）" name="jd" required
        ><UTextarea
          v-model="form.jd"
          class="w-full"
          :rows="9"
          maxlength="30000"
          placeholder="岗位职责、任职要求和其他相关信息…"
      /></UFormField>
      <UAlert v-if="error" color="error" :description="error" role="alert" />
      <UButton type="submit" label="保存职位" :loading="busy" block />
    </UForm>
  </ModalPanel>
</template>
