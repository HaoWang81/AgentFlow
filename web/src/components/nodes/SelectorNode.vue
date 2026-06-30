<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { GitBranch } from 'lucide-vue-next'

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
    'relative min-w-[280px] bg-white rounded-xl shadow-sm border-2 transition-all duration-200',
    selected ? 'border-amber-500 shadow-md shadow-amber-100' : 'border-gray-200 hover:border-amber-300'
  ]">
    <Handle type="target" :position="Position.Left" class="w-2 h-2 bg-amber-500 border-2 border-white left-[-5px]" />
    
    <div class="flex items-center justify-between p-2.5 border-b border-gray-100 bg-gradient-to-r from-amber-50 to-white rounded-t-xl">
      <div class="flex items-center gap-2">
        <div class="bg-amber-100 text-amber-600 p-1.5 rounded-lg">
          <GitBranch :size="16" />
        </div>
        <div class="text-sm font-bold text-gray-800">{{ data.label || '选择器' }}</div>
      </div>
    </div>
    
    <div class="p-3 bg-white rounded-b-xl flex flex-col gap-3">
      <div v-if="!data.cases || data.cases.length === 0" class="text-xs text-gray-400 font-mono bg-gray-50 p-2 rounded border border-gray-100 truncate">
        未配置分支...
        <Handle type="source" :position="Position.Right" id="else" class="w-2.5 h-2.5 bg-gray-400 border-2 border-white right-[-5px] top-[50%]" />
      </div>
      <div v-else class="flex flex-col gap-3 mt-1">
        <!-- 分支列表 -->
        <div 
          v-for="(caseItem, index) in data.cases" 
          :key="index" 
          class="flex items-center gap-2 relative min-h-[32px]"
        >
          <!-- 如果 / 否则如果 -->
          <div class="text-xs font-bold text-gray-700 w-[55px] shrink-0 text-left">
            {{ index === 0 ? '如果' : '否则如果' }}
          </div>
          
          <!-- 条件展示框 -->
          <div class="flex-1 bg-gray-100 text-gray-600 px-3 py-1.5 rounded text-[11px] font-mono truncate border border-gray-200 flex items-center h-full" :title="caseItem.condition">
            {{ caseItem.label || caseItem.condition || '未命名条件' }}
          </div>

          <!-- 对应 Handle -->
          <Handle 
            type="source" 
            :position="Position.Right" 
            :id="'case_' + index" 
            class="w-2.5 h-2.5 bg-amber-500 border-2 border-white"
            :style="{ right: '-17px' }"
          />
        </div>

        <!-- 兜底 Else 分支 -->
        <div class="flex items-center gap-2 relative min-h-[32px]">
          <div class="text-xs font-bold text-gray-700 w-[55px] shrink-0 text-left">
            否则
          </div>
          <div class="flex-1 bg-gray-50 text-gray-400 px-3 py-1.5 rounded text-[11px] border border-dashed border-gray-200 flex items-center h-full">
            默认处理逻辑
          </div>
          <Handle 
            type="source" 
            :position="Position.Right" 
            id="else" 
            class="w-2.5 h-2.5 bg-gray-400 border-2 border-white"
            :style="{ right: '-17px' }"
          />
        </div>
      </div>
    </div>
  </div>
</template>
