<script setup lang="ts">
import { X } from 'lucide-vue-next'
defineProps<{ title: string }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLElement>()
let previous: HTMLElement | null = null
onMounted(() => {
  previous = document.activeElement as HTMLElement
  dialog.value?.focus()
})
onUnmounted(() => previous?.focus())
function trap(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
  if (e.key !== 'Tab') return
  const elements = dialog.value?.querySelectorAll<HTMLElement>(
    'button:not(:disabled),input,textarea,select,a[href],[tabindex="0"]',
  )
  if (!elements?.length) return
  const first = elements[0],
    last = elements[elements.length - 1]
  if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.value)) {
    e.preventDefault()
    last?.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first?.focus()
  }
}
</script>
<template>
  <Teleport to="body"
    ><div class="dialog-backdrop" @click.self="emit('close')">
      <section
        ref="dialog"
        class="dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        tabindex="-1"
        @keydown="trap"
      >
        <div class="row between">
          <h2>{{ title }}</h2>
          <button class="ghost small" aria-label="关闭" @click="emit('close')">
            <X :size="20" />
          </button>
        </div>
        <slot />
      </section></div
  ></Teleport>
</template>
