<script setup lang="ts">
import type { Fact, Generation, Resume } from '#shared/types'
import { Copy, Download, Save, Trash2 } from 'lucide-vue-next'
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
  <div class="stack">
    <section class="panel">
      <div class="row between">
        <h2>定制简历</h2>
        <span class="tag">{{
          generation.edited ? '已手动编辑 · 请自行核对' : '已通过模型事实核验 · 请审阅'
        }}</span>
      </div>
      <div class="row">
        <button @click="editing = !editing">{{ editing ? '预览' : '编辑内容' }}</button
        ><button
          v-if="editing"
          class="primary"
          :disabled="busy"
          @click="emit('save', content, generation.version)"
        >
          <Save :size="16" />保存修改</button
        ><a :href="`/api/generations/${generation.id}/pdf`" class="button" download
          ><Download :size="16" />下载 PDF</a
        ><button class="small ghost danger" @click="emit('remove')">
          <Trash2 :size="16" />删除版本
        </button>
      </div>
      <p v-if="editing" class="subtle">
        下载使用已保存版本；手动修改不会再次经过模型核验，也不会改变原始档案。
      </p>
      <div class="resume">
        <label v-if="editing">简历标题<input v-model="content.headline" maxlength="180" /></label>
        <h2 v-else>{{ content.headline }}</h2>
        <p v-for="c in contacts" :key="c.id" class="subtle">{{ c.content }}</p>
        <section v-for="(section, si) in content.sections" :key="si">
          <label v-if="editing">章节标题<input v-model="section.title" maxlength="80" /></label>
          <h3 v-else>{{ section.title }}</h3>
          <ul>
            <li v-for="(item, ii) in section.items" :key="ii">
              <textarea
                v-if="editing"
                v-model="item.text"
                :aria-label="`简历条目 ${si + 1}-${ii + 1}`"
                maxlength="1500"
              /><span v-else>{{ item.text }}</span>
              <div class="source-links">
                <button v-for="id in item.factIds" :key="id" @click="emit('source', id)">
                  {{ label(id) }}
                </button>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </section>
    <section class="panel">
      <h2>专属打招呼语</h2>
      <div v-if="copyError" class="error">{{ copyError }}</div>
      <article v-for="(g, i) in content.greetings" :key="g.style" class="greeting">
        <div class="row between">
          <h3>{{ g.style }}</h3>
          <button class="small" @click="copy(g.text, g.style)">
            <Copy :size="14" />{{ copied === g.style ? '已复制' : '复制' }}
          </button>
        </div>
        <textarea v-if="editing" v-model="g.text" :aria-label="`招呼语 ${i + 1}`" maxlength="150" />
        <p v-else>{{ g.text }}</p>
        <div class="meta">{{ g.text.length }}/150 字</div>
        <div class="source-links">
          <button v-for="id in g.factIds" :key="id" @click="emit('source', id)">
            {{ label(id) }}
          </button>
        </div>
      </article>
    </section>
  </div>
</template>
