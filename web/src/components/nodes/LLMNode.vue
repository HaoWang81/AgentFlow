<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { BrainCircuit, Settings2 } from 'lucide-vue-next'

const props = defineProps({
  data: {
    type: Object,
    required: true,
  },
  selected: {
    type: Boolean,
    default: false,
  }
})
</script>

<template>
  <div :class="[
    'relative min-w-[130px] max-w-[180px] bg-white rounded-xl shadow-sm border-2 transition-all duration-200',
    selected ? 'border-purple-500 shadow-md shadow-purple-100' : 'border-gray-200 hover:border-purple-300'
  ]">
    <Handle type="target" :position="Position.Left" class="w-2 h-2 bg-purple-500 border-2 border-white left-[-5px]" />
    
    <!-- Header -->
    <div class="flex items-center justify-between p-1.5 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-white rounded-t-xl">
      <div class="flex items-center gap-1.5">
        <div class="bg-purple-100 text-purple-600 p-1 rounded-lg">
          <BrainCircuit :size="14" />
        </div>
        <div class="text-xs font-bold text-gray-800">{{ data.label || '大模型' }}</div>
      </div>
    </div>
    
    <!-- Body -->
    <div class="p-1.5 bg-white rounded-b-xl">
      <div class="text-[10px] text-gray-500 font-medium mb-1 line-clamp-1">
        模型: <span class="text-purple-600">{{ data.model || 'gpt-4o' }}</span>
      </div>
      <div class="text-[10px] text-gray-400 truncate">
        {{ data.systemPrompt || '未配置提示词...' }}
      </div>
    </div>

    <Handle type="source" :position="Position.Right" class="w-2 h-2 bg-purple-500 border-2 border-white right-[-5px]" />
  </div>
</template>
