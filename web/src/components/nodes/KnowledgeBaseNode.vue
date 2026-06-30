<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { Database } from 'lucide-vue-next'

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
    'relative min-w-[150px] max-w-[200px] bg-white rounded-xl shadow-sm border-2 transition-all duration-200',
    selected ? 'border-teal-500 shadow-md shadow-teal-100' : 'border-gray-200 hover:border-teal-300'
  ]">
    <Handle type="target" :position="Position.Left" class="w-2 h-2 bg-teal-500 border-2 border-white left-[-5px]" />
    
    <div class="flex items-center justify-between p-2 border-b border-gray-100 bg-gradient-to-r from-teal-50 to-white rounded-t-xl">
      <div class="flex items-center gap-1.5">
        <div class="bg-teal-100 text-teal-600 p-1 rounded-lg">
          <Database :size="14" />
        </div>
        <div class="text-xs font-bold text-gray-800">{{ data.label || '知识库' }}</div>
      </div>
    </div>
    
    <div class="p-2 bg-white rounded-b-xl flex flex-col gap-1">
      <div class="text-[10px] text-gray-500 font-medium truncate">
        引用的知识库: <span class="text-teal-600 font-semibold">{{ data.kbName || '未选择' }}</span>
      </div>
    </div>

    <Handle type="source" :position="Position.Right" class="w-2 h-2 bg-teal-500 border-2 border-white right-[-5px]" />
  </div>
</template>
