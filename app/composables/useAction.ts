export function useAction() {
  const busy = ref(false),
    error = ref('')
  async function act<T>(fn: () => Promise<T>): Promise<T | undefined> {
    if (busy.value) return
    busy.value = true
    error.value = ''
    try {
      return await fn()
    } catch (e: unknown) {
      const err = e as { data?: { message?: string }; message?: string }
      error.value = err.data?.message || err.message || '操作失败，请重试'
    } finally {
      busy.value = false
    }
  }
  return { busy, error, act }
}
