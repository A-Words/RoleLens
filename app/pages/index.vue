<script setup lang="ts">
import {
  Upload,
  MessageSquareText,
  Sparkles,
  FileCheck2,
  FolderOpen,
  FileText,
  Code2,
  Plus,
} from 'lucide-vue-next'
import {
  categories,
  categoryLabels,
  type Fact,
  type FactInput,
  type Source,
  type Draft,
} from '#shared/types'
const { data: facts, refresh: refreshFacts } = await useFetch<Fact[]>('/api/facts')
const { data: drafts, refresh: refreshDrafts } = await useFetch<Draft[]>('/api/drafts')
const { busy, error, act } = useAction()
const category = ref('all'),
  text = ref(''),
  targetId = ref(''),
  showImport = ref(false),
  showManual = ref(false)
const editing = ref<Fact | null>(null),
  source = ref<Source | null>(null),
  history = ref<Fact[] | null>(null),
  deleting = ref<Fact | null>(null)
const fileInput = ref<HTMLInputElement>()
const blank: FactInput = { category: 'project', title: '', content: '', enabled: true }
const filtered = computed(() =>
  (facts.value || []).filter((f) => category.value === 'all' || f.category === category.value),
)
async function refresh() {
  await Promise.all([refreshFacts(), refreshDrafts()])
}
function importText() {
  return act(async () => {
    await $fetch('/api/import', {
      method: 'POST',
      body: { text: text.value, targetId: targetId.value || undefined },
    })
    text.value = ''
    targetId.value = ''
    await refreshDrafts()
  })
}
function importFile() {
  return act(async () => {
    const file = fileInput.value?.files?.[0]
    if (!file) throw new Error('请选择文件')
    const form = new FormData()
    form.append('file', file)
    await $fetch('/api/import', { method: 'POST', body: form })
    showImport.value = false
    await refreshDrafts()
  })
}
function confirmDraft(id: string, value: FactInput) {
  return act(async () => {
    await $fetch(`/api/drafts/${id}/confirm`, { method: 'POST', body: value })
    await refresh()
  })
}
function saveEdit(value: FactInput) {
  return act(async () => {
    if (!editing.value) return
    await $fetch(`/api/facts/${editing.value.id}`, {
      method: 'PATCH',
      body: { ...value, version: editing.value.version },
    })
    editing.value = null
    await refresh()
  })
}
function manual(value: FactInput) {
  return act(async () => {
    await $fetch('/api/drafts', { method: 'POST', body: value })
    showManual.value = false
    await refreshDrafts()
  })
}
function remove() {
  return act(async () => {
    if (!deleting.value) return
    await $fetch(`/api/facts/${deleting.value.id}`, {
      method: 'DELETE',
      body: { version: deleting.value.version },
    })
    deleting.value = null
    await refresh()
  })
}
function viewSource(id: string) {
  return act(async () => {
    source.value = await $fetch<Source>(`/api/sources/${id}`)
  })
}
function viewHistory(id: string) {
  return act(async () => {
    history.value = await $fetch<Fact[]>(`/api/facts/${id}/versions`)
  })
}
</script>
<template>
  <header class="page-head">
    <div>
      <h1>个人资料库</h1>
      <p>整理真实经历，让每一次表达都有依据。</p>
    </div>
    <button class="primary" @click="showImport = true"><Upload :size="18" />导入资料</button>
  </header>
  <div v-if="error" class="error" role="alert">{{ error }}</div>
  <div v-if="busy" class="notice" role="status">正在处理，请稍候…</div>
  <div class="split">
    <section class="panel">
      <div class="row between">
        <h2>已确认资料</h2>
        <button class="small ghost" @click="showManual = true"><Plus :size="16" />手动录入</button>
      </div>
      <div class="tabs" aria-label="资料类别">
        <button :class="{ active: category === 'all' }" @click="category = 'all'">全部</button
        ><button
          v-for="c in categories"
          :key="c"
          :class="{ active: category === c }"
          @click="category = c"
        >
          {{ categoryLabels[c] }}
        </button>
      </div>
      <div v-if="!filtered.length" class="empty">
        <FolderOpen :size="40" />
        <h3>从一段真实经历开始</h3>
        <p>导入简历、项目文档，或在右侧与 Agent 对话。<br />草稿经你确认后，会出现在这里。</p>
      </div>
      <article v-for="fact in filtered" :key="fact.id" class="fact-row">
        <div class="fact-icon">
          <Code2 v-if="fact.category === 'project'" :size="21" /><FileText v-else :size="20" />
        </div>
        <div class="fact-body">
          <h3>{{ fact.title }}</h3>
          <p>{{ fact.content }}</p>
          <div class="meta">
            <span>{{ categoryLabels[fact.category] }}</span
            ><span>v{{ fact.version }}</span
            ><span v-if="!fact.enabled" class="tag">已排除</span
            ><button class="small ghost" @click="viewSource(fact.sourceId)">查看来源</button>
          </div>
          <div class="row">
            <button class="small" @click="editing = fact">编辑</button
            ><button class="small ghost" @click="viewHistory(fact.id)">版本记录</button
            ><button class="small ghost danger" @click="deleting = fact">删除</button>
          </div>
        </div>
      </article>
    </section>
    <div class="stack">
      <section class="panel">
        <h2><MessageSquareText :size="21" />对话补充</h2>
        <p class="muted">用自然语言告诉我你的经历或需求，我会帮你整理并生成草稿供你确认。</p>
        <form class="form" @submit.prevent="importText">
          <label
            >补充方式<select v-model="targetId">
              <option value="">新增经历</option>
              <option v-for="f in facts" :key="f.id" :value="f.id">修改：{{ f.title }}</option>
            </select></label
          ><label
            ><span class="sr-only">经历描述</span
            ><textarea
              v-model="text"
              aria-label="经历描述"
              placeholder="介绍一段经历，或告诉我需要修改什么…"
              rows="5"
              required
              maxlength="60000"
            /></label
          ><button class="primary full" :disabled="busy"><Sparkles :size="18" />整理为草稿</button>
        </form>
      </section>
      <section class="panel">
        <h2>
          <FileCheck2 :size="21" />待确认草稿 <span class="tag">{{ drafts?.length || 0 }}</span>
        </h2>
        <p class="muted">以下内容需由你核对，确认后才会用于生成。</p>
        <p v-if="!drafts?.length" class="subtle">还没有待确认草稿。</p>
        <article v-for="draft in drafts" :key="draft.id" class="draft">
          <p v-if="draft.targetId" class="notice">将更新已有资料，确认时检查版本。</p>
          <FactForm
            :value="draft"
            submit-label="确认入库"
            :busy="busy"
            @save="confirmDraft(draft.id, $event)"
          /><button
            class="small ghost"
            :disabled="busy"
            @click="
              act(async () => {
                await $fetch(`/api/drafts/${draft.id}`, { method: 'DELETE' })
                await refreshDrafts()
              })
            "
          >
            丢弃草稿
          </button>
        </article>
      </section>
    </div>
  </div>
  <ModalPanel v-if="showImport" title="导入资料" @close="showImport = false"
    ><p class="muted">
      支持文字型 PDF、DOCX、Markdown、TXT，最大 10
      MB。资料将发送到配置的模型提取草稿，请先移除无关敏感内容。
    </p>
    <form class="form" @submit.prevent="importFile">
      <input
        ref="fileInput"
        aria-label="资料文件"
        type="file"
        accept=".pdf,.docx,.md,.txt"
        required
      />
      <div v-if="error" class="error">{{ error }}</div>
      <button class="primary" :disabled="busy">{{ busy ? '正在整理…' : '上传并整理' }}</button>
    </form></ModalPanel
  >
  <ModalPanel v-if="showManual" title="手动录入" @close="showManual = false"
    ><FactForm :value="blank" submit-label="保存为草稿" :busy="busy" @save="manual"
  /></ModalPanel>
  <ModalPanel v-if="editing" title="编辑资料" @close="editing = null"
    ><div v-if="error" class="error">{{ error }}</div>
    <FactForm :value="editing" submit-label="保存修改" :busy="busy" @save="saveEdit"
  /></ModalPanel>
  <ModalPanel v-if="source" :title="source.name" @close="source = null">
    <pre>{{ source.text }}</pre>
  </ModalPanel>
  <ModalPanel v-if="history" title="版本记录" @close="history = null"
    ><article v-for="f in history" :key="f.version" class="draft">
      <h3>v{{ f.version }} · {{ f.title }}</h3>
      <p class="subtle">{{ f.updatedAt }}</p>
      <pre>{{ f.content }}</pre>
    </article></ModalPanel
  >
  <ModalPanel v-if="deleting" title="删除资料" @close="deleting = null"
    ><p>删除「{{ deleting.title }}」后，后续生成不再使用。已有简历、来源材料和历史版本仍保留。</p>
    <button class="danger" :disabled="busy" @click="remove">确认删除</button></ModalPanel
  >
</template>
