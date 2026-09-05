<script setup lang="ts">
import { ArrowLeft, Sparkles, MessageSquareText, ListChecks, RotateCcw } from 'lucide-vue-next'
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
</script>
<template>
  <NuxtLink to="/jobs" class="back"><ArrowLeft :size="16" />返回职位列表</NuxtLink>
  <header class="page-head">
    <div>
      <h1>{{ data?.job.title }}</h1>
      <p>{{ data?.job.company }}</p>
    </div>
    <button class="primary" :disabled="busy" @click="start">
      <Sparkles :size="18" />{{ data?.sessions.length ? '重新分析' : '开始分析' }}
    </button>
  </header>
  <div v-if="error" class="error" role="alert">{{ error }}</div>
  <div class="split">
    <div class="stack">
      <section class="panel">
        <details>
          <summary>查看职位描述（JD）</summary>
          <p style="white-space: pre-wrap; margin-top: 16px">{{ data?.job.jd }}</p>
        </details>
      </section>
      <section v-if="session?.analysis" class="panel">
        <h2><ListChecks :size="21" />岗位匹配与依据</h2>
        <article v-for="(r, i) in session.analysis.requirements" :key="i" class="analysis-item">
          <h3>{{ r.requirement }}</h3>
          <p>{{ r.assessment }}</p>
          <span v-if="!r.factIds.length" class="tag">暂无已确认依据</span>
          <div class="source-links">
            <button v-for="id in r.factIds" :key="id" @click="viewFact(id)">
              {{ facts?.find((f) => f.id === id)?.title || '历史事实' }}
            </button>
          </div>
        </article>
      </section>
      <div v-if="data?.generations.length" class="row">
        <label class="full"
          >生成版本<select v-model="selectedGeneration">
            <option v-for="g in data.generations" :key="g.id" :value="g.id">
              {{ new Date(g.createdAt).toLocaleString('zh-CN') }}{{ g.edited ? ' · 已编辑' : '' }}
            </option>
          </select></label
        >
      </div>
      <ResumeEditor
        v-if="generation"
        :generation="generation"
        :facts="facts || []"
        :busy="busy"
        @save="save"
        @remove="deleting = true"
        @source="viewEvidence"
      />
      <section v-else-if="!session" class="panel empty">
        <Sparkles :size="36" />
        <h3>用你的真实经历回应这个职位</h3>
        <p>Agent 会检索资料、核对来源，必要时向你追问。<br />请先在资料库确认至少一段相关经历。</p>
      </section>
    </div>
    <div class="stack">
      <section class="panel">
        <h2><MessageSquareText :size="21" />分析对话</h2>
        <label v-if="data?.sessions.length"
          >分析会话<select v-model="selectedId" :disabled="busy">
            <option v-for="s in data.sessions" :key="s.id" :value="s.id">
              {{ new Date(s.createdAt).toLocaleString('zh-CN') }} · {{ statusLabels[s.status] }}
            </option>
          </select></label
        >
        <p v-if="session" class="meta" style="margin-top: 16px" role="status">
          {{ statusLabels[session.status] }}
        </p>
        <p v-if="busy" class="loading">Agent 正在处理，请稍候…</p>
        <div v-if="session?.status === 'waiting'">
          <p>以下问题会帮助我判断哪些经历更适合这个岗位：</p>
          <ol>
            <li v-for="q in session.question" :key="q">{{ q }}</li>
          </ol>
          <form class="form" @submit.prevent="resume()">
            <label
              >你的补充<textarea
                v-model="answer"
                rows="5"
                maxlength="6000"
                placeholder="可以补充表达偏好；新增事实请先整理入库。"
              /></label
            ><button class="primary" :disabled="busy">继续生成</button
            ><button :disabled="busy" type="button" @click="resume(true)">
              跳过，使用已确认事实</button
            ><button
              v-if="answer.trim()"
              type="button"
              class="small ghost"
              :disabled="busy"
              @click="draftAnswer"
            >
              将新增经历整理为草稿
            </button>
            <p class="subtle">确认新事实后，请回到此职位重新分析。</p>
          </form>
        </div>
        <div v-else-if="session?.status === 'failed'">
          <p class="error">{{ session.error }}</p>
          <button :disabled="busy" @click="act(() => run())">
            <RotateCcw :size="16" />从检查点重试
          </button>
        </div>
        <button
          v-else-if="session && ['ready', 'running'].includes(session.status) && !busy"
          @click="act(() => run())"
        >
          继续执行
        </button>
        <p v-else-if="session?.status === 'complete'" class="muted">
          本次分析已完成。请核对生成内容和来源，按需编辑后使用。
        </p>
        <p v-else-if="!session" class="muted">
          点击「开始分析」，建立这份 JD 与你的经历之间的联系。
        </p>
      </section>
      <section v-if="traces.length" class="panel">
        <h2>执行记录</h2>
        <ul class="trace">
          <li v-for="t in traces" :key="t.id">
            <details>
              <summary>
                {{ traceLabels[t.event] || t.event }}
                <span class="subtle">{{ new Date(t.createdAt).toLocaleTimeString('zh-CN') }}</span>
              </summary>
              <pre>{{ t.detail }}</pre>
            </details>
          </li>
        </ul>
      </section>
    </div>
  </div>
  <ModalPanel v-if="source" :title="source.name" @close="source = null">
    <pre>{{ source.text }}</pre>
  </ModalPanel>
  <ModalPanel v-if="deleting" title="删除生成版本" @close="deleting = false"
    ><p>删除当前简历与招呼语版本？原始资料不受影响。</p>
    <button class="danger" :disabled="busy" @click="remove">确认删除版本</button></ModalPanel
  >
</template>
