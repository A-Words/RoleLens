<script setup lang="ts">
import type { Fact, Job, Session, Generation, Trace, Resume, Source } from '#shared/types'
const route = useRoute(),
  jobId = String(route.params.id)
const { data, refresh } = await useFetch<{
  job: Job
  sessions: Session[]
  generations: Generation[]
}>(`/api/jobs/${jobId}`)
if (!data.value) throw createError({ statusCode: 404, message: '职位不存在' })
const { data: facts, refresh: refreshFacts } = await useFetch<Fact[]>('/api/facts')
const { busy, error, act } = useAction()
const selectedId = ref(data.value.sessions[0]?.id || ''),
  selectedGeneration = ref(data.value.generations[0]?.id || '')
const session = ref<Session | null>(data.value.sessions[0] || null),
  traces = ref<Trace[]>([]),
  answer = ref(''),
  source = ref<Source | null>(null),
  deleting = ref(false)
const generation = computed(() =>
  data.value?.generations.find((g) => g.id === selectedGeneration.value),
)
let timer: ReturnType<typeof setInterval> | undefined
async function poll() {
  if (!selectedId.value) return
  const detail = await $fetch<{ session: Session; traces: Trace[] }>(
    `/api/sessions/${selectedId.value}`,
  )
  session.value = detail.session
  traces.value = detail.traces
}
watch(selectedId, () => {
  poll().catch(() => {})
})
onMounted(() => {
  poll().catch(() => {})
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})
async function run(resumeAnswer?: string) {
  timer = setInterval(() => {
    poll().catch(() => {})
  }, 1500)
  try {
    await $fetch(`/api/sessions/${selectedId.value}/run`, {
      method: 'POST',
      body: { answer: resumeAnswer },
    })
  } finally {
    if (timer) clearInterval(timer)
    await Promise.all([poll(), refresh(), refreshFacts()])
    selectedGeneration.value =
      data.value?.generations.find((g) => g.sessionId === selectedId.value)?.id ||
      selectedGeneration.value
  }
}
function start() {
  return act(async () => {
    const s = await $fetch<Session>(`/api/jobs/${jobId}/sessions`, { method: 'POST' })
    selectedId.value = s.id
    await run()
  })
}
function resume(skip = false) {
  return act(() => run(skip ? '' : answer.value))
}
function save(content: Resume, version: number) {
  return act(async () => {
    await $fetch(`/api/generations/${selectedGeneration.value}`, {
      method: 'PATCH',
      body: { content, version },
    })
    await refresh()
  })
}
function remove() {
  return act(async () => {
    await $fetch(`/api/generations/${selectedGeneration.value}`, { method: 'DELETE' })
    deleting.value = false
    await refresh()
    selectedGeneration.value = data.value?.generations[0]?.id || ''
  })
}
function viewFact(id: string) {
  return act(async () => {
    const f = facts.value?.find((f) => f.id === id)
    if (!f) throw new Error('该资料已删除，请重新分析。旧简历仍保留生成时的依据。')
    source.value = {
      id: f.sourceId,
      name: `${f.title} · v${f.version}`,
      text: f.content,
      createdAt: f.updatedAt,
    }
  })
}
function viewEvidence(id: string) {
  const f = generation.value?.evidence.find((f) => f.id === id)
  if (f)
    source.value = {
      id: f.sourceId,
      name: `${f.title} · v${f.version} · 生成时的确认事实`,
      text: f.content,
      createdAt: f.updatedAt,
    }
}
function draftAnswer() {
  return act(async () => {
    await $fetch('/api/import', {
      method: 'POST',
      body: { text: answer.value, name: '职位追问补充' },
    })
    await navigateTo('/')
  })
}
const statusLabels: Record<string, string> = {
  ready: '待开始',
  running: '执行中',
  waiting: '等待补充',
  complete: '已完成',
  failed: '执行失败',
}
const traceLabels: Record<string, string> = {
  analyze_jd: '分析 JD',
  search_facts: '检索资料',
  read_source: '读取来源',
  assess_match: '评估匹配',
  request_information: '接收补充',
  generate: '生成内容',
  verify_facts: '核验事实',
  save_generation: '保存版本',
  error: '执行失败',
}

const sessionItems = computed(() =>
  (data.value?.sessions || []).map((s) => ({
    label: new Date(s.createdAt).toLocaleString('zh-CN') + ' · ' + statusLabels[s.status],
    value: s.id,
  })),
)
const generationItems = computed(() =>
  (data.value?.generations || []).map((g) => ({
    label: new Date(g.createdAt).toLocaleString('zh-CN') + (g.edited ? ' · 已编辑' : ''),
    value: g.id,
  })),
)
const traceItems = computed(() =>
  traces.value.map((t) => ({
    label:
      (traceLabels[t.event] || t.event) + ' · ' + new Date(t.createdAt).toLocaleTimeString('zh-CN'),
    content: t.detail,
    value: String(t.id),
  })),
)
const statusColor = computed(() =>
  session.value?.status === 'failed'
    ? 'error'
    : session.value?.status === 'complete'
      ? 'success'
      : 'warning',
)
</script>
<template>
  <WorkspacePage :title="data?.job.title || '职位详情'" :description="data?.job.company" back>
    <template #actions
      ><UButton
        :label="data?.sessions.length ? '重新分析' : '开始分析'"
        icon="i-lucide-sparkles"
        :loading="busy"
        @click="start"
    /></template>
    <UAlert v-if="error" color="error" title="操作未完成" :description="error" role="alert" />
    <div class="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div class="min-w-0 space-y-6">
        <UAccordion
          :items="[
            { label: '查看职位描述（JD）', content: data?.job.jd, icon: 'i-lucide-file-text' },
          ]"
          :ui="{ body: 'whitespace-pre-wrap text-sm leading-7 text-toned' }"
        />
        <UCard v-if="session?.analysis">
          <template #header
            ><div class="flex items-center gap-2">
              <UIcon name="i-lucide-list-checks" class="size-5 text-primary" />
              <h2 class="font-semibold">岗位匹配与依据</h2>
            </div></template
          >
          <div class="divide-y divide-default">
            <article
              v-for="(r, i) in session.analysis.requirements"
              :key="i"
              class="space-y-3 py-5 first:pt-0 last:pb-0"
            >
              <h3 class="text-sm font-medium">{{ r.requirement }}</h3>
              <p class="text-sm leading-6 text-muted">{{ r.assessment }}</p>
              <UBadge
                v-if="!r.factIds.length"
                color="warning"
                variant="subtle"
                label="暂无已确认依据"
              />
              <div v-else class="flex flex-wrap gap-2">
                <UButton
                  v-for="id in r.factIds"
                  :key="id"
                  :label="facts?.find((f) => f.id === id)?.title || '历史事实'"
                  icon="i-lucide-link"
                  size="xs"
                  variant="soft"
                  @click="viewFact(id)"
                />
              </div>
            </article>
          </div>
        </UCard>
        <UFormField v-if="data?.generations.length" label="生成版本"
          ><USelect v-model="selectedGeneration" :items="generationItems" class="w-full"
        /></UFormField>
        <ResumeEditor
          v-if="generation"
          :generation="generation"
          :facts="facts || []"
          :busy="busy"
          @save="save"
          @remove="deleting = true"
          @source="viewEvidence"
        />
        <UEmpty
          v-else-if="!session"
          icon="i-lucide-scan-search"
          title="用真实经历回应这个职位"
          description="Agent 会检索已确认资料、分析匹配点，在信息不足时向你追问。"
          variant="subtle"
          class="py-16"
          ><template #actions
            ><UButton to="/" label="查看我的资料" color="neutral" variant="outline" /></template
        ></UEmpty>
        <UEmpty
          v-else-if="session.status === 'complete'"
          icon="i-lucide-file-plus-2"
          title="本次分析已完成"
          description="可重新分析生成新版本，原始资料会继续保留。"
          variant="subtle"
        />
      </div>
      <div class="min-w-0 space-y-6">
        <UCard :ui="{ root: 'bg-elevated/30' }">
          <template #header
            ><div class="flex items-center justify-between">
              <h2 class="flex items-center gap-2 font-semibold">
                <UIcon name="i-lucide-bot-message-square" class="size-5 text-primary" />分析对话
              </h2>
              <UBadge
                v-if="session"
                :color="statusColor"
                variant="subtle"
                :label="statusLabels[session.status]"
                role="status"
              /></div
          ></template>
          <div class="space-y-5">
            <UFormField v-if="data?.sessions.length" label="分析会话"
              ><USelect v-model="selectedId" :items="sessionItems" :disabled="busy" class="w-full"
            /></UFormField>
            <div v-if="busy" class="space-y-3">
              <p class="text-sm text-muted" role="status">Agent 正在处理，请稍候…</p>
              <UProgress />
            </div>
            <div v-if="session?.status === 'waiting'" class="space-y-5">
              <p class="text-sm leading-6 text-toned">
                以下问题会帮助我判断哪些经历更适合这个岗位：
              </p>
              <ol class="list-decimal space-y-3 pl-5 text-sm leading-6">
                <li v-for="q in session.question" :key="q">{{ q }}</li>
              </ol>
              <form class="space-y-4" @submit.prevent="resume()">
                <UFormField label="你的补充" name="answer"
                  ><UTextarea
                    id="job-answer"
                    v-model="answer"
                    :rows="5"
                    maxlength="6000"
                    class="w-full"
                    placeholder="补充表达偏好；新增事实请先整理入库。"
                /></UFormField>
                <UButton
                  type="submit"
                  label="继续生成"
                  icon="i-lucide-arrow-right"
                  :loading="busy"
                  block
                />
                <UButton
                  type="button"
                  label="跳过，使用已确认事实"
                  color="neutral"
                  variant="outline"
                  :disabled="busy"
                  block
                  @click="resume(true)"
                />
                <UButton
                  v-if="answer.trim()"
                  type="button"
                  label="将新增经历整理为草稿"
                  variant="link"
                  :disabled="busy"
                  block
                  @click="draftAnswer"
                />
                <p class="text-xs leading-5 text-muted">确认新事实后，请回到此职位重新分析。</p>
              </form>
            </div>
            <div v-else-if="session?.status === 'failed'" class="space-y-4">
              <UAlert color="error" :description="session.error || '执行失败'" /><UButton
                label="从检查点重试"
                icon="i-lucide-rotate-ccw"
                :loading="busy"
                color="neutral"
                variant="outline"
                block
                @click="act(() => run())"
              />
            </div>
            <UButton
              v-else-if="session && ['ready', 'running'].includes(session.status) && !busy"
              label="继续执行"
              block
              @click="act(() => run())"
            />
            <p v-else-if="session?.status === 'complete'" class="text-sm leading-7 text-muted">
              本次分析已完成。请核对生成内容和来源，按需编辑后使用。
            </p>
            <p v-else-if="!session" class="text-sm leading-7 text-muted">
              点击「开始分析」，建立这份 JD 与你的经历之间的联系。
            </p>
          </div>
        </UCard>
        <section v-if="traces.length" class="rounded-lg border border-default p-5">
          <h2 class="mb-3 text-sm font-semibold">执行记录</h2>
          <UAccordion
            :items="traceItems"
            type="multiple"
            :ui="{
              body: 'whitespace-pre-wrap break-words font-mono text-xs leading-6',
              trigger: 'text-xs',
            }"
          />
        </section>
      </div>
    </div>
  </WorkspacePage>
  <USlideover
    v-if="source"
    :open="true"
    :title="source.name"
    description="与这段表达关联的确认事实"
    :ui="{ content: 'sm:max-w-xl' }"
    @update:open="
      (value) => {
        if (!value) source = null
      }
    "
    ><template #body>
      <pre class="whitespace-pre-wrap break-words font-sans text-sm leading-7">{{
        source.text
      }}</pre>
    </template></USlideover
  >
  <ModalPanel
    v-if="deleting"
    title="删除生成版本"
    description="删除当前简历与招呼语版本？原始资料不受影响。"
    :busy="busy"
    @close="deleting = false"
    ><div class="flex justify-end gap-3">
      <UButton label="取消" color="neutral" variant="outline" @click="deleting = false" /><UButton
        label="确认删除版本"
        color="error"
        :loading="busy"
        @click="remove"
      /></div
  ></ModalPanel>
</template>
