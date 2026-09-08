<script setup lang="ts">
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
const { data: sources, refresh: refreshSources } =
  await useFetch<Pick<Source, 'id' | 'name'>[]>('/api/sources')
const route = useRoute()
const returnJob = computed(() =>
  typeof route.query.job === 'string' && /^[a-f0-9-]{36}$/.test(route.query.job)
    ? route.query.job
    : '',
)
const { busy, error, act } = useAction()
const category = ref('all'),
  text = ref(''),
  targetId = ref('new'),
  showImport = ref(false),
  showManual = ref(false)
const editing = ref<Fact | null>(null),
  source = ref<Source | null>(null),
  history = ref<Fact[] | null>(null),
  deleting = ref<Fact | null>(null)
const selectedFile = ref<File | null>(null)
const view = ref(route.query.view === 'drafts' ? 'drafts' : 'facts')
const expandedGroups = ref<string[]>([])
const expandedFacts = ref<string[]>([])
const search = ref('')
const toast = useToast()
const categoryItems = [
  { label: '所有类别', value: 'all' },
  ...categories.map((value) => ({ label: categoryLabels[value], value })),
]
const targetItems = computed(() => [
  { label: '新增经历', value: 'new' },
  ...(facts.value || []).map((f) => ({ label: '修改：' + f.title, value: f.id })),
])
const viewItems = computed(() => [
  { label: '已确认资料', value: 'facts', badge: facts.value?.length || 0 },
  { label: '待确认草稿', value: 'drafts', badge: drafts.value?.length || 0 },
])
const blank: FactInput = { category: 'project', title: '', content: '', enabled: true }
const filtered = computed(() =>
  (facts.value || []).filter(
    (f) =>
      (category.value === 'all' || f.category === category.value) &&
      (f.title + ' ' + f.content).toLowerCase().includes(search.value.toLowerCase()),
  ),
)
const groups = computed(() => {
  const grouped = new Map<string, Fact[]>()
  for (const fact of filtered.value)
    grouped.set(fact.sourceId, [...(grouped.get(fact.sourceId) || []), fact])
  return [...grouped].map(([id, items]) => ({
    value: id,
    label: `${sources.value?.find((s) => s.id === id)?.name || '资料来源'} · ${items.length} 条`,
    facts: items,
  }))
})
watch(
  groups,
  (value) => {
    expandedGroups.value =
      search.value || category.value !== 'all'
        ? value.map((g) => g.value)
        : value.length === 1 && (value[0]?.facts.length || 0) <= 3
          ? value.map((g) => g.value)
          : []
  },
  { immediate: true },
)
async function refresh() {
  await Promise.all([refreshFacts(), refreshDrafts(), refreshSources()])
}
function importText() {
  return act(async () => {
    await $fetch('/api/import', {
      method: 'POST',
      body: { text: text.value, targetId: targetId.value === 'new' ? undefined : targetId.value },
    })
    text.value = ''
    targetId.value = 'new'
    await refreshDrafts()
    view.value = 'drafts'
  })
}
function importFile() {
  return act(async () => {
    const file = selectedFile.value
    if (!file) throw new Error('请选择文件')
    const form = new FormData()
    form.append('file', file)
    await $fetch('/api/import', { method: 'POST', body: form })
    showImport.value = false
    await refreshDrafts()
    view.value = 'drafts'
  })
}
function confirmDraft(id: string, value: FactInput) {
  return act(async () => {
    await $fetch(`/api/drafts/${id}/confirm`, { method: 'POST', body: value })
    await refresh()
    toast.add({ title: '资料已确认入库', color: 'success' })
    if (!drafts.value?.length) view.value = 'facts'
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
    view.value = 'drafts'
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
  <WorkspacePage
    title="个人资料库"
    description="把真实经历整理为可复用的求职档案，由你确认每一条事实。"
    simple-header
  >
    <template #actions>
      <UButton
        color="neutral"
        variant="outline"
        icon="i-lucide-plus"
        label="手动录入"
        aria-label="手动录入"
        :ui="{ label: 'hidden sm:inline' }"
        @click="showManual = true"
      />
      <UButton
        icon="i-lucide-upload"
        label="导入资料"
        aria-label="导入资料"
        :ui="{ label: 'hidden sm:inline' }"
        @click="showImport = true"
      />
    </template>
    <UAlert
      v-if="returnJob"
      title="补充当前职位所需资料"
      description="确认草稿后，返回原职位重新分析，使新事实进入匹配。"
    />
    <UButton
      v-if="returnJob"
      :to="`/jobs/${returnJob}`"
      label="返回原职位"
      icon="i-lucide-arrow-left"
      variant="outline"
    />
    <UAlert
      v-if="error"
      role="alert"
      color="error"
      variant="subtle"
      title="操作未完成"
      :description="error"
    />
    <div class="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section class="min-w-0 space-y-5" aria-label="资料列表">
        <UTabs
          v-model="view"
          :items="viewItems"
          :content="false"
          variant="link"
          :ui="{ list: 'w-full', trigger: 'flex-1' }"
        />
        <template v-if="view === 'facts'">
          <div class="flex flex-wrap items-center gap-3">
            <UInput
              v-model="search"
              icon="i-lucide-search"
              aria-label="搜索资料"
              placeholder="搜索已确认资料…"
              class="w-full sm:w-auto sm:min-w-0 sm:flex-1"
            />
            <USelect
              v-model="category"
              :items="categoryItems"
              aria-label="筛选资料类别"
              class="w-full sm:w-40"
            />
          </div>
          <UEmpty
            v-if="!filtered.length"
            icon="i-lucide-folder-open"
            :title="facts?.length ? '没有找到匹配资料' : '建立你的第一段经历'"
            :description="
              facts?.length
                ? '试试其他关键词或资料类别。'
                : '导入现有简历，或通过对话整理。只有你确认的事实才会用于生成。'
            "
            variant="subtle"
            class="py-16"
          >
            <template #actions
              ><UButton
                v-if="!facts?.length"
                label="手动录入"
                color="neutral"
                variant="outline"
                @click="showManual = true"
            /></template>
          </UEmpty>
          <UAccordion v-else v-model="expandedGroups" :items="groups" type="multiple">
            <template #body="{ item }">
              <article
                v-for="fact in item.facts"
                :key="fact.id"
                data-testid="fact-row"
                class="space-y-4 p-5 sm:p-6"
              >
                <div class="flex items-start gap-3">
                  <UIcon
                    :name="fact.category === 'project' ? 'i-lucide-code-xml' : 'i-lucide-file-text'"
                    class="mt-1 size-5 shrink-0 text-primary"
                  />
                  <div class="min-w-0 flex-1">
                    <h2 class="font-semibold text-highlighted">{{ fact.title }}</h2>
                    <div class="mt-2 flex flex-wrap gap-2">
                      <UBadge
                        color="neutral"
                        variant="subtle"
                        :label="categoryLabels[fact.category]"
                      /><UBadge
                        v-if="!fact.enabled"
                        color="warning"
                        variant="soft"
                        label="已排除"
                      /><span class="text-xs text-muted">v{{ fact.version }}</span>
                    </div>
                  </div>
                  <UButton
                    icon="i-lucide-pencil"
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    label="编辑"
                    @click="editing = fact"
                  />
                </div>
                <p
                  class="whitespace-pre-wrap break-words text-sm leading-7 text-toned"
                  :class="{ 'line-clamp-3': !expandedFacts.includes(fact.id) }"
                >
                  {{ fact.content }}
                </p>
                <UButton
                  v-if="fact.content.length > 120"
                  :label="expandedFacts.includes(fact.id) ? '收起正文' : '展开正文'"
                  variant="link"
                  size="xs"
                  @click="
                    expandedFacts = expandedFacts.includes(fact.id)
                      ? expandedFacts.filter((id) => id !== fact.id)
                      : [...expandedFacts, fact.id]
                  "
                />
                <div class="flex flex-wrap items-center gap-2">
                  <UButton
                    icon="i-lucide-file-search"
                    color="neutral"
                    variant="link"
                    size="sm"
                    label="查看来源"
                    @click="viewSource(fact.sourceId)"
                  />
                  <UButton
                    icon="i-lucide-history"
                    color="neutral"
                    variant="link"
                    size="sm"
                    label="版本记录"
                    @click="viewHistory(fact.id)"
                  />
                  <UButton
                    icon="i-lucide-trash-2"
                    color="error"
                    variant="ghost"
                    size="sm"
                    label="删除"
                    class="ml-auto"
                    @click="deleting = fact"
                  />
                </div>
              </article>
            </template>
          </UAccordion>
        </template>
        <template v-else>
          <UAlert
            v-if="drafts?.length"
            color="info"
            variant="subtle"
            icon="i-lucide-file-check-2"
            title="确认后才会用于生成"
            description="请核对内容、来源与个人贡献，也可以直接修改草稿。"
          />
          <UEmpty
            v-if="!drafts?.length"
            icon="i-lucide-inbox"
            title="没有待确认草稿"
            description="新导入的资料和对话整理结果会出现在这里。"
            variant="subtle"
          />
          <UCard v-for="draft in drafts" :key="draft.id">
            <template #header
              ><div class="flex items-center justify-between gap-3">
                <h2 class="font-semibold">
                  {{ draft.targetId ? '更新已有资料' : '新增资料草稿' }}
                </h2>
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  label="丢弃草稿"
                  :disabled="busy"
                  @click="
                    act(async () => {
                      await $fetch('/api/drafts/' + draft.id, { method: 'DELETE' })
                      await refreshDrafts()
                    })
                  "
                /></div
            ></template>
            <FactForm
              :value="draft"
              submit-label="确认入库"
              :busy="busy"
              @save="confirmDraft(draft.id, $event)"
            />
          </UCard>
        </template>
      </section>
      <UCard :ui="{ root: 'bg-elevated/30' }">
        <template #header
          ><div class="flex items-center gap-2">
            <UIcon name="i-lucide-sparkles" class="size-5 text-primary" />
            <h2 class="font-semibold">对话补充</h2>
          </div></template
        >
        <p class="mb-5 text-sm leading-6 text-muted">
          写下你想补充的经历，或选择一条已有资料说明需要修改的内容。
        </p>
        <form class="space-y-5" @submit.prevent="importText">
          <UFormField label="补充到哪里"
            ><USelect v-model="targetId" :items="targetItems" class="w-full"
          /></UFormField>
          <UFormField label="想补充什么" help="不必组织成简历语言，先写清你做了什么。"
            ><UTextarea
              v-model="text"
              class="w-full"
              :rows="7"
              required
              maxlength="60000"
              placeholder="例如：这个项目里我负责了哪些部分？做了什么、遇到什么问题，又是怎么解决的？"
          /></UFormField>
          <UButton
            type="submit"
            icon="i-lucide-sparkles"
            label="整理为草稿"
            :loading="busy"
            block
          />
        </form>
        <template #footer
          ><p class="flex items-start gap-2 text-xs leading-5 text-muted">
            <UIcon
              name="i-lucide-shield-check"
              class="mt-0.5 size-4 shrink-0"
            />整理结果会进入「待确认草稿」，由你核对后入库，不会直接覆盖已有资料。
          </p></template
        >
      </UCard>
    </div>
  </WorkspacePage>
  <ModalPanel
    v-if="showImport"
    title="导入资料"
    description="上传现有简历或项目文档，整理为待确认草稿。"
    :busy="busy"
    @close="showImport = false"
  >
    <form class="space-y-5" @submit.prevent="importFile">
      <UFormField label="资料文件"
        ><UFileUpload
          v-model="selectedFile"
          accept=".pdf,.docx,.md,.txt"
          label="选择文件或拖放到这里"
          description="文字型 PDF、DOCX、Markdown、TXT · 最大 10 MB"
          :disabled="busy"
      /></UFormField>
      <UAlert
        color="neutral"
        variant="subtle"
        icon="i-lucide-info"
        description="资料文本将发送到配置的模型，请先移除无关敏感内容。扫描件请改用文字资料。"
      />
      <UAlert v-if="error" color="error" :description="error" />
      <UButton
        type="submit"
        label="上传并整理"
        icon="i-lucide-upload"
        :loading="busy"
        :disabled="!selectedFile"
        block
      />
    </form>
  </ModalPanel>
  <ModalPanel
    v-if="showManual"
    title="手动录入"
    description="先保存草稿，再核对并确认入库。"
    :busy="busy"
    @close="showManual = false"
    ><UAlert v-if="error" color="error" :description="error" class="mb-4" /><FactForm
      :value="blank"
      submit-label="保存为草稿"
      :busy="busy"
      @save="manual"
  /></ModalPanel>
  <ModalPanel
    v-if="editing"
    title="编辑资料"
    description="保存将建立新的资料版本。"
    :busy="busy"
    @close="editing = null"
    ><UAlert v-if="error" color="error" :description="error" class="mb-4" /><FactForm
      :value="editing"
      submit-label="保存修改"
      :busy="busy"
      @save="saveEdit"
  /></ModalPanel>
  <USlideover
    v-if="source"
    :open="true"
    :title="source.name"
    description="本机保存的原始来源"
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
  <USlideover
    v-if="history"
    :open="true"
    title="版本记录"
    description="查看这条资料的历次确认内容。"
    :ui="{ content: 'sm:max-w-xl' }"
    @update:open="
      (value) => {
        if (!value) history = null
      }
    "
    ><template #body
      ><div class="space-y-6">
        <article
          v-for="f in history"
          :key="f.version"
          class="space-y-3 border-b border-default pb-6"
        >
          <div class="flex gap-2">
            <UBadge color="neutral" :label="'v' + f.version" />
            <h3 class="font-medium">{{ f.title }}</h3>
          </div>
          <p class="text-xs text-muted">{{ new Date(f.updatedAt).toLocaleString('zh-CN') }}</p>
          <p class="whitespace-pre-wrap break-words text-sm leading-7">{{ f.content }}</p>
        </article>
      </div></template
    ></USlideover
  >
  <ModalPanel
    v-if="deleting"
    title="删除资料"
    :description="
      '删除「' + deleting.title + '」后，后续生成不再使用。已有简历、来源和历史版本仍保留。'
    "
    :busy="busy"
    @close="deleting = null"
    ><div class="flex justify-end gap-3">
      <UButton
        label="取消"
        color="neutral"
        variant="outline"
        :disabled="busy"
        @click="deleting = null"
      /><UButton label="确认删除" color="error" :loading="busy" @click="remove" /></div
  ></ModalPanel>
</template>
