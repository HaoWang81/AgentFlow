<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { Wrench } from 'lucide-vue-next'

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
    selected ? 'border-orange-500 shadow-md shadow-orange-100' : 'border-gray-200 hover:border-orange-300'
  ]">
    <Handle type="target" :position="Position.Left" class="w-2 h-2 bg-orange-500 border-2 border-white left-[-5px]" />
    
    <div class="flex items-center justify-between p-2 border-b border-gray-100 bg-gradient-to-r from-orange-50 to-white rounded-t-xl">
      <div class="flex items-center gap-1.5">
        <div class="bg-orange-100 text-orange-600 p-1 rounded-lg">
          <Wrench :size="14" />
        </div>
        <div class="text-xs font-bold text-gray-800">{{ data.label || '插件工具' }}</div>
      </div>
    </div>
    
    <div class="p-2 bg-white rounded-b-xl flex flex-col gap-1">
      <div class="text-[10px] text-gray-500 font-medium truncate">
        引用的插件: <span class="text-orange-600 font-semibold">{{ data.pluginName || '未选择' }}</span>
      </div>
    </div>

    <Handle type="source" :position="Position.Right" class="w-2 h-2 bg-orange-500 border-2 border-white right-[-5px]" />
  </div>
</template>
