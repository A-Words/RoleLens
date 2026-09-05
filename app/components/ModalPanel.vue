<script setup lang="ts">
defineProps<{ title: string; description?: string; busy?: boolean }>()
const emit = defineEmits<{ close: [] }>()
</script>
<template>
  <UModal
    :open="true"
    :title="title"
    :description="description"
    :dismissible="!busy"
    :close="{ disabled: busy }"
    :ui="{ content: 'sm:max-w-2xl' }"
    @update:open="
      (value) => {
        if (!value) emit('close')
      }
    "
    ><template #body><slot /></template
  ></UModal>
</template>
