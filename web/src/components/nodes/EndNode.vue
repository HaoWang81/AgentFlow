<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { SquareTerminal } from 'lucide-vue-next'

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
    'relative min-w-[100px] bg-white rounded-xl shadow-sm border-2 transition-all duration-200',
    selected ? 'border-orange-500 shadow-md shadow-orange-100' : 'border-gray-200 hover:border-orange-300'
  ]">
    <Handle type="target" :position="Position.Left" class="w-2 h-2 bg-orange-500 border-2 border-white left-[-5px]" />
    <div class="flex items-center gap-1.5 p-1.5">
      <div class="bg-orange-100 text-orange-600 p-1 rounded-lg">
        <SquareTerminal :size="14" />
      </div>
      <div class="text-xs font-bold text-gray-800">{{ data.label || '结束' }}</div>
    </div>
  </div>
</template>
