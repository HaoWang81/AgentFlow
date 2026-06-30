<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { CheckCircle2, XCircle, AlertCircle, Info } from 'lucide-vue-next'

const props = defineProps<{
  text: string
  type: 'success' | 'error' | 'warning' | 'info'
  onClose: () => void
}>()

const visible = ref(false)

onMounted(() => {
  visible.value = true
  setTimeout(() => {
    visible.value = false
    setTimeout(props.onClose, 300) // wait for animation
  }, 3000)
})

const icons = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertCircle,
  info: Info
}

const colors = {
  success: 'bg-green-50 text-green-600 border-green-200',
  error: 'bg-red-50 text-red-600 border-red-200',
  warning: 'bg-yellow-50 text-yellow-600 border-yellow-200',
  info: 'bg-blue-50 text-blue-600 border-blue-200'
}
</script>

<template>
  <transition name="toast">
    <div v-if="visible" class="fixed top-8 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 px-4 py-2.5 rounded-xl border shadow-xl font-medium text-sm transition-all backdrop-blur-md bg-opacity-95" :class="colors[type]">
      <component :is="icons[type]" :size="18" />
      <span>{{ text }}</span>
    </div>
  </transition>
</template>

<style scoped>
.toast-enter-active, .toast-leave-active { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
.toast-enter-from { opacity: 0; transform: translate(-50%, -20px); }
.toast-leave-to { opacity: 0; transform: translate(-50%, -20px); }
</style>
