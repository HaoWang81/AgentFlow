<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { AlertTriangle } from 'lucide-vue-next'

const props = defineProps<{
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
}>()

const visible = ref(false)

onMounted(() => {
  // Give it a tick to transition
  setTimeout(() => visible.value = true, 10)
})

const handleAction = (action: 'confirm' | 'cancel') => {
  visible.value = false
  setTimeout(() => {
    action === 'confirm' ? props.onConfirm() : props.onCancel()
  }, 200)
}
</script>

<template>
  <div class="fixed inset-0 z-[9999] flex items-center justify-center">
    <!-- Backdrop -->
    <div 
      class="absolute inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity duration-200"
      :class="visible ? 'opacity-100' : 'opacity-0'"
      @click="handleAction('cancel')"
    ></div>
    
    <!-- Dialog -->
    <div 
      class="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 transform transition-all duration-200"
      :class="visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'"
    >
      <div class="flex items-start gap-4">
        <div class="bg-red-100 text-red-600 p-2.5 rounded-full shrink-0">
          <AlertTriangle :size="24" />
        </div>
        <div>
          <h3 class="text-lg font-bold text-gray-900">{{ title }}</h3>
          <p class="text-sm text-gray-500 mt-2 leading-relaxed">{{ message }}</p>
        </div>
      </div>
      
      <div class="mt-8 flex justify-end gap-3">
        <button 
          @click="handleAction('cancel')"
          class="px-5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
        >
          取消
        </button>
        <button 
          @click="handleAction('confirm')"
          class="px-5 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition shadow-sm"
        >
          确认删除
        </button>
      </div>
    </div>
  </div>
</template>
