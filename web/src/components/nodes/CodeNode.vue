<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { Code2, Settings2 } from 'lucide-vue-next'

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
    'relative min-w-[130px] max-w-[180px] bg-white rounded-xl shadow-sm border-2 transition-all duration-200',
    selected ? 'border-zinc-800 shadow-md shadow-zinc-200' : 'border-gray-200 hover:border-zinc-500'
  ]">
    <Handle type="target" :position="Position.Left" class="w-2 h-2 bg-zinc-800 border-2 border-white left-[-5px]" />
    
    <div class="flex items-center justify-between p-1.5 border-b border-gray-100 bg-gradient-to-r from-zinc-100 to-white rounded-t-xl">
      <div class="flex items-center gap-1.5">
        <div class="bg-zinc-800 text-white p-1 rounded-lg">
          <Code2 :size="14" />
        </div>
        <div class="text-xs font-bold text-gray-800">{{ data.label || '代码执行' }}</div>
      </div>
    </div>
    
    <div class="p-1.5 bg-white rounded-b-xl flex flex-col gap-1.5">
      <div class="text-[10px] text-zinc-500 font-mono bg-zinc-50 p-1 rounded border border-zinc-100 truncate">
        def main(args): ...
      </div>
    </div>

    <Handle type="source" :position="Position.Right" class="w-2 h-2 bg-zinc-800 border-2 border-white right-[-5px]" />
  </div>
</template>
