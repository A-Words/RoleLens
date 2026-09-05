<script setup lang="ts">
import { resumeSchema, type Fact, type Generation, type Resume } from '#shared/types'
const props = defineProps<{ generation: Generation; facts: Fact[]; busy?: boolean }>()
const emit = defineEmits<{
  save: [value: Resume, version: number]
  remove: []
  source: [factId: string]
}>()
const content = ref<Resume>(structuredClone(toRaw(props.generation.content))),
  editing = ref(false),
  copied = ref(''),
  copyError = ref('')
watch(
  () => props.generation,
  (g) => {
    content.value = structuredClone(toRaw(g.content))
    editing.value = false
  },
  { deep: true },
)
const label = (id: string) =>
  props.generation.evidence.find((f) => f.id === id)?.title || '历史事实'
const contacts = computed(() => props.facts.filter((f) => f.category === 'contact' && f.enabled))
async function copy(text: string, style: string) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = style
    copyError.value = ''
  } catch {
    copyError.value = '复制失败，请在文本框中手动选择并复制。'
    editing.value = true
  }
}
</script>
<template>
  <UForm
    :state="content"
    :schema="resumeSchema"
    class="space-y-6"
    @submit="emit('save', $event.data, generation.version)"
  >
    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="font-semibold text-highlighted">定制简历</h2>
          <UBadge
            :color="generation.edited ? 'warning' : 'success'"
            variant="subtle"
            :label="generation.edited ? '已手动编辑 · 请自行核对' : '已通过模型事实核验 · 请审阅'"
          />
        </div>
      </template>
      <div class="mb-6 flex flex-wrap gap-2">
        <UButton
          :label="editing ? '预览' : '编辑内容'"
          :icon="editing ? 'i-lucide-eye' : 'i-lucide-pencil'"
          color="neutral"
          variant="outline"
          @click="editing = !editing"
        />
        <UButton
          v-if="editing"
          type="submit"
          label="保存修改"
          icon="i-lucide-save"
          :loading="busy"
        />
        <UButton
          :to="'/api/generations/' + generation.id + '/pdf'"
          label="下载 PDF"
          icon="i-lucide-download"
          color="neutral"
          variant="outline"
          external
          download
        />
        <UButton
          label="删除版本"
          icon="i-lucide-trash-2"
          color="error"
          variant="ghost"
          class="sm:ml-auto"
          @click="emit('remove')"
        />
      </div>
      <UAlert
        v-if="editing"
        color="info"
        variant="subtle"
        description="下载使用已保存版本。手动修改不会再次经过模型核验，也不会改变原始档案。"
        class="mb-6"
      />
      <div class="space-y-6 rounded-lg border border-default bg-default p-5 sm:p-8">
        <UFormField v-if="editing" name="headline" label="简历标题" required
          ><UInput v-model="content.headline" class="w-full" maxlength="180"
        /></UFormField>
        <h3 v-else class="text-xl font-semibold tracking-tight">{{ content.headline }}</h3>
        <div v-if="contacts.length" class="space-y-1">
          <p v-for="c in contacts" :key="c.id" class="text-sm text-muted">{{ c.content }}</p>
        </div>
        <section v-for="(section, si) in content.sections" :key="si" class="space-y-4">
          <UFormField v-if="editing" :name="'sections.' + si + '.title'" label="章节标题" required
            ><UInput v-model="section.title" class="w-full" maxlength="80"
          /></UFormField>
          <h4 v-else class="border-b border-default pb-2 font-semibold text-highlighted">
            {{ section.title }}
          </h4>
          <div v-for="(item, ii) in section.items" :key="ii" class="space-y-2">
            <UFormField
              v-if="editing"
              :name="'sections.' + si + '.items.' + ii + '.text'"
              :label="'简历条目 ' + (si + 1) + '-' + (ii + 1)"
              required
              ><UTextarea v-model="item.text" class="w-full" :rows="4" maxlength="1500"
            /></UFormField>
            <p v-else class="whitespace-pre-wrap break-words text-sm leading-7">{{ item.text }}</p>
            <div class="flex flex-wrap gap-1">
              <UButton
                v-for="id in item.factIds"
                :key="id"
                :label="label(id)"
                icon="i-lucide-link"
                size="xs"
                variant="soft"
                @click="emit('source', id)"
              />
            </div>
          </div>
        </section>
      </div>
    </UCard>
    <UCard>
      <template #header
        ><div class="flex items-center gap-2">
          <UIcon name="i-lucide-messages-square" class="size-5 text-primary" />
          <h2 class="font-semibold">专属打招呼语</h2>
        </div></template
      >
      <UAlert v-if="copyError" color="error" :description="copyError" class="mb-4" />
      <div class="divide-y divide-default">
        <article
          v-for="(g, i) in content.greetings"
          :key="g.style"
          class="space-y-3 py-5 first:pt-0 last:pb-0"
        >
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-medium">{{ g.style }}</h3>
            <UButton
              :label="copied === g.style ? '已复制' : '复制'"
              :icon="copied === g.style ? 'i-lucide-check' : 'i-lucide-copy'"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="copy(g.text, g.style)"
            />
          </div>
          <UFormField
            v-if="editing"
            :name="'greetings.' + i + '.text'"
            :label="'招呼语 ' + (i + 1)"
            required
            ><UTextarea v-model="g.text" class="w-full" maxlength="150" :rows="3"
          /></UFormField>
          <p v-else class="text-sm leading-7">{{ g.text }}</p>
          <div class="flex flex-wrap items-center gap-2">
            <UButton
              v-for="id in g.factIds"
              :key="id"
              :label="label(id)"
              size="xs"
              variant="soft"
              @click="emit('source', id)"
            /><span class="ml-auto text-xs text-muted">{{ g.text.length }}/150 字</span>
          </div>
        </article>
      </div>
    </UCard>
  </UForm>
</template>
