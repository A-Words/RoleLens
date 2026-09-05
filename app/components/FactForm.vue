<script setup lang="ts">
import { categories, categoryLabels, factInput, type FactInput } from '#shared/types'
const props = defineProps<{ value: FactInput; submitLabel: string; busy?: boolean }>()
const emit = defineEmits<{ save: [value: FactInput] }>()
const form = ref<FactInput>({ ...props.value })
watch(
  () => props.value,
  (value) => {
    form.value = { ...value }
  },
)
const categoryItems = categories.map((value) => ({ label: categoryLabels[value], value }))
</script>
<template>
  <UForm :schema="factInput" :state="form" class="space-y-5" @submit="emit('save', $event.data)">
    <div class="grid gap-5 sm:grid-cols-[140px_1fr]">
      <UFormField label="类别" name="category" required
        ><USelect v-model="form.category" :items="categoryItems" class="w-full"
      /></UFormField>
      <UFormField label="标题" name="title" required
        ><UInput
          v-model="form.title"
          class="w-full"
          maxlength="120"
          placeholder="例如：个人项目的名称"
      /></UFormField>
    </div>
    <UFormField
      label="经历内容"
      name="content"
      required
      description="保留真实职责、实现内容和已确认的成果。"
      ><UTextarea v-model="form.content" class="w-full" :rows="6" maxlength="6000"
    /></UFormField>
    <UFormField name="enabled"
      ><UCheckbox
        v-model="form.enabled"
        :label="form.category === 'contact' ? '允许用于生成（仅本地加入 PDF）' : '允许用于生成'"
    /></UFormField>
    <UButton type="submit" :label="submitLabel" :loading="busy" icon="i-lucide-check" block />
  </UForm>
</template>
