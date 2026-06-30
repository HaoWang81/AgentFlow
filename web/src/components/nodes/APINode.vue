<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { Webhook, Settings2 } from 'lucide-vue-next'

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
    selected ? 'border-blue-500 shadow-md shadow-blue-100' : 'border-gray-200 hover:border-blue-300'
  ]">
    <Handle type="target" :position="Position.Left" class="w-2 h-2 bg-blue-500 border-2 border-white left-[-5px]" />
    
    <div class="flex items-center justify-between p-1.5 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-white rounded-t-xl">
      <div class="flex items-center gap-1.5">
        <div class="bg-blue-100 text-blue-600 p-1 rounded-lg">
          <Webhook :size="14" />
        </div>
        <div class="text-xs font-bold text-gray-800">{{ data.label || 'API请求' }}</div>
      </div>
    </div>
    
    <div class="p-1.5 bg-white rounded-b-xl">
      <div class="flex items-center gap-1 mb-1">
        <span class="text-[9px] font-bold px-1 py-0.5 rounded text-blue-700 bg-blue-100">{{ data.method || 'GET' }}</span>
        <span class="text-[10px] text-gray-500 truncate">{{ data.url || 'http://...' }}</span>
      </div>
    </div>

    <Handle type="source" :position="Position.Right" class="w-2 h-2 bg-blue-500 border-2 border-white right-[-5px]" />
  </div>
</template>
