<script setup lang="ts">
import { Plus, BriefcaseBusiness, ArrowUpRight } from 'lucide-vue-next'
import type { Job } from '#shared/types'
const { data: jobs } = await useFetch<Job[]>('/api/jobs')
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
  <header class="page-head">
    <div>
      <h1>职位工作台</h1>
      <p>从岗位要求出发，找到最值得讲述的经历。</p>
    </div>
    <button class="primary" @click="creating = true"><Plus :size="18" />添加职位</button>
  </header>
  <section class="panel">
    <h2>我的职位</h2>
    <div v-if="!jobs?.length" class="empty">
      <BriefcaseBusiness :size="40" />
      <h3>下一份机会，从这里开始</h3>
      <p>粘贴一份 JD，让 Agent 帮你准备专属表达。</p>
      <button @click="creating = true">添加第一个职位</button>
    </div>
    <NuxtLink v-for="job in jobs" :key="job.id" :to="`/jobs/${job.id}`" class="job-row"
      ><div class="row between">
        <h3>{{ job.title }}</h3>
        <ArrowUpRight :size="18" />
      </div>
      <p>{{ job.company }} · {{ new Date(job.createdAt).toLocaleDateString('zh-CN') }}</p>
      <p>{{ job.jd.slice(0, 160) }}{{ job.jd.length > 160 ? '…' : '' }}</p></NuxtLink
    >
  </section>
  <ModalPanel v-if="creating" title="添加职位" @close="creating = false"
    ><form class="form" @submit.prevent="create">
      <label>公司<input v-model="form.company" maxlength="120" required /></label
      ><label>职位名称<input v-model="form.title" maxlength="120" required /></label
      ><label
        >职位描述（JD）<textarea
          v-model="form.jd"
          rows="9"
          minlength="10"
          maxlength="30000"
          required
          placeholder="粘贴岗位职责、任职要求和其他相关信息…"
        />
      </label>
      <div v-if="error" class="error" role="alert">{{ error }}</div>
      <button class="primary" :disabled="busy">保存职位</button>
    </form></ModalPanel
  >
</template>
