<script setup lang="ts">
import { categories, categoryLabels, type FactInput } from '#shared/types'
const props = defineProps<{ value: FactInput; submitLabel: string; busy?: boolean }>()
const emit = defineEmits<{ save: [value: FactInput] }>()
const form = ref<FactInput>({ ...props.value })
watch(
  () => props.value,
  (v) => {
    form.value = { ...v }
  },
)
</script>
<template>
  <form class="form" @submit.prevent="emit('save', form)">
    <label
      >类别<select v-model="form.category">
        <option v-for="c in categories" :key="c" :value="c">{{ categoryLabels[c] }}</option>
      </select></label
    >
    <label>标题<input v-model="form.title" required maxlength="120" /></label>
    <label>经历内容<textarea v-model="form.content" required maxlength="6000" rows="5" /></label>
    <label class="check"
      ><input v-model="form.enabled" type="checkbox" />允许用于生成{{
        form.category === 'contact' ? '（仅本地加入 PDF）' : ''
      }}</label
    >
    <button class="primary full" :disabled="busy">{{ submitLabel }}</button>
  </form>
</template>
