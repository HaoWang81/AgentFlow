<script setup lang="ts">
import { ref } from 'vue'
import { X, PlayCircle, Loader2, BugPlay } from 'lucide-vue-next'

const props = defineProps<{
  isRunning: boolean
}>()

const emit = defineEmits(['close', 'run'])

const inputData = ref('{"query": "你好"}')
const outputData = ref('')

const handleRun = () => {
  outputData.value = ''
  emit('run', inputData.value, async (chunk: string) => {
    outputData.value += chunk
    
    // 让滚动条始终保持在最底部
    requestAnimationFrame(() => {
      const preEl = document.querySelector('.debug-output-pre')
      if (preEl) preEl.scrollTop = preEl.scrollHeight
    })
  })
}
</script>

<template>
  <div class="w-[400px] bg-white border-l border-gray-200 shadow-2xl flex flex-col z-50 overflow-hidden absolute right-0 top-0 bottom-0 transform transition-transform duration-300">
    <div class="h-14 border-b border-gray-100 flex items-center justify-between px-5 font-bold text-gray-800 bg-gray-50/50">
      <div class="flex items-center gap-2">
        <BugPlay :size="18" class="text-indigo-500" /> 工作流调试
      </div>
      <button @click="$emit('close')" class="text-gray-400 hover:text-gray-600 transition p-1 hover:bg-gray-200 rounded-md">
        <X :size="18" />
      </button>
    </div>

    <div class="flex flex-col flex-1 overflow-hidden p-4 gap-4 bg-gray-50">
      <!-- Input Section -->
      <div class="flex flex-col h-[30%] bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex-shrink-0">
        <div class="px-3 py-2 border-b border-gray-100 bg-gray-50 text-xs font-bold text-gray-600">
          输入参数 (Input)
        </div>
        <textarea 
          v-model="inputData"
          class="flex-1 w-full p-3 resize-none focus:outline-none text-sm font-mono text-gray-700 bg-transparent"
          placeholder="在此输入 JSON 测试参数或问题..."
        ></textarea>
      </div>

      <!-- Action Button -->
      <button 
        @click="handleRun" 
        :disabled="isRunning" 
        class="w-full py-2.5 bg-indigo-600 text-white rounded-xl shadow-sm hover:bg-indigo-700 transition font-bold flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed flex-shrink-0"
      >
        <Loader2 v-if="isRunning" :size="16" class="animate-spin" />
        <PlayCircle v-else :size="16" /> 
        {{ isRunning ? '运行中...' : '测试运行' }}
      </button>

      <!-- Output Section -->
      <div class="flex flex-col flex-1 bg-[#1e1e1e] rounded-xl border border-gray-800 shadow-sm overflow-hidden">
        <div class="px-3 py-2 border-b border-gray-700 bg-[#2d2d2d] text-xs font-bold text-gray-300">
          执行日志与结果 (Output)
        </div>
        <div class="flex-1 p-3 overflow-y-auto debug-output-pre">
          <pre v-if="outputData" class="text-xs font-mono text-green-400 whitespace-pre-wrap break-all min-h-full">{{ outputData }}</pre>
          <div v-else class="text-xs text-gray-500 italic flex h-full items-center justify-center">等待执行...</div>
        </div>
      </div>
    </div>
  </div>
</template>
