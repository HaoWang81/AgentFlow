<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { Play } from 'lucide-vue-next'

const props = defineProps({
  id: {
    type: String,
    required: true,
  },
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
    'relative min-w-[100px] bg-white rounded-xl shadow-sm border-2 transition-all duration-200',
    selected ? 'border-green-500 shadow-md shadow-green-100' : 'border-gray-200 hover:border-green-300'
  ]">
    <div class="flex items-center gap-1.5 p-1.5 border-b border-gray-100">
      <div class="bg-green-100 text-green-600 p-1 rounded-lg">
        <Play :size="14" />
      </div>
      <div class="text-xs font-bold text-gray-800">{{ data.label || '开始' }}</div>
    </div>

    <Handle type="source" :position="Position.Right" class="w-2 h-2 bg-green-500 border-2 border-white right-[-5px]" />
  </div>
</template>
