<script setup lang="ts">
import { ref } from 'vue'
import { BrainCircuit, Webhook, Code2, Play, SquareTerminal, Bot, Database, Wrench, GitBranch, Plus, Minus, Layers } from 'lucide-vue-next'

const onDragStart = (event: DragEvent, nodeType: string, nodeLabel: string) => {
  if (event.dataTransfer) {
    event.dataTransfer.setData('application/vueflow', JSON.stringify({ type: nodeType, label: nodeLabel }))
    event.dataTransfer.effectAllowed = 'move'
  }
}

const isBasicCollapsed = ref(false)
const isBusinessCollapsed = ref(false)
const isLogicCollapsed = ref(false)
</script>

<template>
  <aside class="w-60 flex flex-col gap-3 p-4 overflow-y-auto select-none">
    <div class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 px-1 flex justify-between items-center cursor-pointer hover:text-gray-600 transition" @click="isBasicCollapsed = !isBasicCollapsed">
      <span>基础节点 Basic Nodes</span>
      <Plus v-if="isBasicCollapsed" :size="12" />
      <Minus v-else :size="12" />
    </div>

    <div v-show="!isBasicCollapsed" class="flex flex-col gap-3">
      <!-- Start Node -->
      <div class="group">
        <div class="draggable-node flex items-center gap-3 p-2.5 border border-transparent rounded-xl cursor-grab hover:border-green-200 hover:bg-green-50 hover:shadow-sm transition-all"
             :draggable="true" @dragstart="onDragStart($event, 'start', '开始')">
          <div class="bg-white border border-green-100 p-1.5 rounded-lg text-green-600 shadow-sm group-hover:bg-green-100 transition-colors"><Play :size="16" /></div>
          <span class="text-sm font-medium text-gray-700">开始节点</span>
        </div>
      </div>

      <!-- End Node -->
      <div class="group">
        <div class="draggable-node flex items-center gap-3 p-2.5 border border-transparent rounded-xl cursor-grab hover:border-orange-200 hover:bg-orange-50 hover:shadow-sm transition-all"
             :draggable="true" @dragstart="onDragStart($event, 'end', '结束')">
          <div class="bg-white border border-orange-100 p-1.5 rounded-lg text-orange-600 shadow-sm group-hover:bg-orange-100 transition-colors"><SquareTerminal :size="16" /></div>
          <span class="text-sm font-medium text-gray-700">结束节点</span>
        </div>
      </div>
    </div>

    <div class="w-full h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent my-1"></div>
    <div class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 px-1 flex justify-between items-center cursor-pointer hover:text-gray-600 transition" @click="isBusinessCollapsed = !isBusinessCollapsed">
      <span>业务节点 Business Nodes</span>
      <Plus v-if="isBusinessCollapsed" :size="12" />
      <Minus v-else :size="12" />
    </div>

    <div v-show="!isBusinessCollapsed" class="flex flex-col gap-3">

    <!-- Agent Node -->
    <div class="group">
      <div class="draggable-node flex items-center gap-3 p-2.5 border border-transparent rounded-xl cursor-grab hover:border-blue-200 hover:bg-blue-50 hover:shadow-sm transition-all"
           :draggable="true" @dragstart="onDragStart($event, 'agent', '智能体')">
        <div class="bg-white border border-blue-100 p-1.5 rounded-lg text-blue-600 shadow-sm group-hover:bg-blue-100 transition-colors"><Bot :size="16" /></div>
        <span class="text-sm font-medium text-gray-700">智能体 (Agent)</span>
      </div>
    </div>

    <!-- Batch Agent Node -->
    <div class="group">
      <div class="draggable-node flex items-center gap-3 p-2.5 border border-transparent rounded-xl cursor-grab hover:border-indigo-200 hover:bg-indigo-50 hover:shadow-sm transition-all"
           :draggable="true" @dragstart="onDragStart($event, 'batch_agent', '批处理智能体')">
        <div class="bg-white border border-indigo-100 p-1.5 rounded-lg text-indigo-600 shadow-sm group-hover:bg-indigo-100 transition-colors"><Layers :size="16" /></div>
        <span class="text-sm font-medium text-gray-700">批处理智能体 (Batch)</span>
      </div>
    </div>

    <!-- Knowledge Base Node -->
    <div class="group">
      <div class="draggable-node flex items-center gap-3 p-2.5 border border-transparent rounded-xl cursor-grab hover:border-teal-200 hover:bg-teal-50 hover:shadow-sm transition-all"
           :draggable="true" @dragstart="onDragStart($event, 'knowledge_base', '知识库')">
        <div class="bg-white border border-teal-100 p-1.5 rounded-lg text-teal-600 shadow-sm group-hover:bg-teal-100 transition-colors"><Database :size="16" /></div>
        <span class="text-sm font-medium text-gray-700">知识库 (KB)</span>
      </div>
    </div>

    <!-- Plugin Node -->
    <div class="group">
      <div class="draggable-node flex items-center gap-3 p-2.5 border border-transparent rounded-xl cursor-grab hover:border-orange-200 hover:bg-orange-50 hover:shadow-sm transition-all"
           :draggable="true" @dragstart="onDragStart($event, 'plugin', '插件')">
        <div class="bg-white border border-orange-100 p-1.5 rounded-lg text-orange-600 shadow-sm group-hover:bg-orange-100 transition-colors"><Wrench :size="16" /></div>
        <span class="text-sm font-medium text-gray-700">插件 (Plugin)</span>
      </div>
    </div>

      <!-- LLM Node (Legacy) -->
      <div class="group">
        <div class="draggable-node flex items-center gap-3 p-2.5 border border-transparent rounded-xl cursor-grab hover:border-purple-200 hover:bg-purple-50 hover:shadow-sm transition-all"
             :draggable="true" @dragstart="onDragStart($event, 'llm', 'LLM Node')">
          <div class="bg-white border border-purple-100 p-1.5 rounded-lg text-purple-600 shadow-sm group-hover:bg-purple-100 transition-colors"><BrainCircuit :size="16" /></div>
          <span class="text-sm font-medium text-gray-700">大模型 (LLM)</span>
        </div>
      </div>
    </div>

    <div class="w-full h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent my-1"></div>
    <div class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 px-1 flex justify-between items-center cursor-pointer hover:text-gray-600 transition" @click="isLogicCollapsed = !isLogicCollapsed">
      <span>逻辑节点 Logic Nodes</span>
      <Plus v-if="isLogicCollapsed" :size="12" />
      <Minus v-else :size="12" />
    </div>

    <div v-show="!isLogicCollapsed" class="flex flex-col gap-3">

    <!-- Code Node -->
    <div class="group">
      <div class="draggable-node flex items-center gap-3 p-2.5 border border-transparent rounded-xl cursor-grab hover:border-zinc-300 hover:bg-zinc-50 hover:shadow-sm transition-all"
           :draggable="true" @dragstart="onDragStart($event, 'code', '代码节点')">
        <div class="bg-white border border-zinc-200 p-1.5 rounded-lg text-zinc-700 shadow-sm group-hover:bg-zinc-200 transition-colors"><Code2 :size="16" /></div>
        <span class="text-sm font-medium text-gray-700">代码节点 (Code)</span>
      </div>
    </div>

    <!-- Selector Node -->
    <div class="group">
      <div class="draggable-node flex items-center gap-3 p-2.5 border border-transparent rounded-xl cursor-grab hover:border-indigo-200 hover:bg-indigo-50 hover:shadow-sm transition-all"
           :draggable="true" @dragstart="onDragStart($event, 'selector', '选择器')">
        <div class="bg-white border border-indigo-100 p-1.5 rounded-lg text-indigo-600 shadow-sm group-hover:bg-indigo-100 transition-colors"><GitBranch :size="16" /></div>
        <span class="text-sm font-medium text-gray-700">选择器 (Selector)</span>
      </div>
    </div>

      <!-- HTTP API Node -->
      <div class="group">
        <div class="draggable-node flex items-center gap-3 p-2.5 border border-transparent rounded-xl cursor-grab hover:border-blue-200 hover:bg-blue-50 hover:shadow-sm transition-all"
             :draggable="true" @dragstart="onDragStart($event, 'api', 'HTTP 请求')">
          <div class="bg-white border border-blue-100 p-1.5 rounded-lg text-blue-600 shadow-sm group-hover:bg-blue-100 transition-colors"><Webhook :size="16" /></div>
          <span class="text-sm font-medium text-gray-700">API 请求 (HTTP)</span>
        </div>
      </div>
    </div>
  </aside>
</template>
