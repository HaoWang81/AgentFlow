<script setup lang="ts">
import { ref, markRaw, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import request from '../utils/request'
import { Message } from '../utils/message'
import { ChevronLeft, Save, PlayCircle, Loader2 } from 'lucide-vue-next'

import Sidebar from '../components/Sidebar.vue'
import PropertiesPanel from '../components/PropertiesPanel.vue'
import StartNode from '../components/nodes/StartNode.vue'
import LLMNode from '../components/nodes/LLMNode.vue'
import EndNode from '../components/nodes/EndNode.vue'
import APINode from '../components/nodes/APINode.vue'
import CodeNode from '../components/nodes/CodeNode.vue'
import AgentNode from '../components/nodes/AgentNode.vue'
import BatchAgentNode from '../components/nodes/BatchAgentNode.vue'
import KnowledgeBaseNode from '../components/nodes/KnowledgeBaseNode.vue'
import PluginNode from '../components/nodes/PluginNode.vue'
import SelectorNode from '../components/nodes/SelectorNode.vue'
import DebugPanel from '../components/DebugPanel.vue'

const route = useRoute()
const router = useRouter()
const { project, onConnect, updateNodeData } = useVueFlow()

const nodes = ref<any[]>([])
const edges = ref<any[]>([])
const workflowName = ref("加载中...")
const isSaving = ref(false)
const isRunning = ref(false)
const showDebugPanel = ref(false)

const selectedNode = ref<any>(null)
const workflowId = Number(route.params.id)

const nodeTypes: any = {
  start: markRaw(StartNode),
  llm: markRaw(LLMNode),
  end: markRaw(EndNode),
  api: markRaw(APINode),
  code: markRaw(CodeNode),
  agent: markRaw(AgentNode),
  batch_agent: markRaw(BatchAgentNode),
  knowledge_base: markRaw(KnowledgeBaseNode),
  plugin: markRaw(PluginNode),
  selector: markRaw(SelectorNode)
}

let id = Date.now()
const getId = () => `dndnode_${id++}`

onConnect((params) => {
  edges.value.push({
    id: `e-${params.source}-${params.target}`,
    source: params.source,
    target: params.target,
    sourceHandle: params.sourceHandle,
    targetHandle: params.targetHandle,
    type: 'default'
  })
})

const fetchWorkflow = async () => {
  try {
    const res = await request.get(`/api/workflows/${workflowId}`)
    if (res.data.nodes && res.data.nodes.length > 0) {
      nodes.value = res.data.nodes
      edges.value = res.data.edges || []
    } else {
      nodes.value = [
        { id: 'start_node', type: 'start', position: { x: 150, y: 300 }, data: { label: '开始' }, deletable: false },
        { id: 'end_node', type: 'end', position: { x: 550, y: 300 }, data: { label: '结束' }, deletable: false }
      ]
      edges.value = [
        { id: 'e-start-end', source: 'start_node', target: 'end_node', type: 'default', updatable: true }
      ]
    }
    workflowName.value = res.data.name
  } catch (error) {
    Message.error('加载工作流数据失败')
    router.push('/console/workflows')
  }
}

const onDragOver = (event: DragEvent) => {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
}

const onDrop = (event: DragEvent) => {
  if (!event.dataTransfer) return
  
  const rawData = event.dataTransfer.getData('application/vueflow')
  if (!rawData) return
  
  const { type, label } = JSON.parse(rawData)
  // project client coordinates to vue flow coordinates
  const position = project({
    x: event.clientX, 
    y: event.clientY,  
  })

  let extraData = {}
  if (type === 'api') extraData = { method: 'GET', url: '' }
  if (type === 'code') extraData = { code: 'def main(args):\n    return args' }
  if (type === 'agent') extraData = { agentId: '', agentName: '' }
  if (type === 'batch_agent') extraData = { agentId: '', agentName: '' }
  if (type === 'knowledge_base') extraData = { kbId: '', kbName: '', topK: 3 }
  if (type === 'plugin') extraData = { pluginId: '', pluginName: '' }
  if (type === 'selector') extraData = { condition: 'return input.status === \'success\'' }

  const newNode = {
    id: getId(),
    type,
    position,
    data: { label, systemPrompt: '', model: 'gpt-4o', ...extraData },
    deletable: true
  }

  nodes.value.push(newNode)
}

const onNodeClick = (event: any) => {
  selectedNode.value = nodes.value.find(n => n.id === event.node.id)
}

const onPaneClick = () => {
  selectedNode.value = null
}

const updateSelectedNode = (updatedNode: any) => {
  const index = nodes.value.findIndex(n => n.id === updatedNode.id)
  if (index !== -1) {
    nodes.value[index] = updatedNode
    selectedNode.value = updatedNode
    updateNodeData(updatedNode.id, updatedNode.data)
  }
}

const saveWorkflow = async () => {
  isSaving.value = true
  try {
    const payload = {
      name: workflowName.value,
      nodes: nodes.value,
      edges: edges.value
    }
    await request.put(`/api/workflows/${workflowId}`, payload)
    setTimeout(() => { isSaving.value = false; Message.success('保存成功') }, 500)
  } catch (error) {
    Message.error('保存失败，请检查网络')
    isSaving.value = false
  }
}

const compileGraph = async (inputData: string, callback: (res: string) => Promise<void> | void) => {
  isRunning.value = true
  await saveWorkflow()
  try {
    const response = await fetch(`http://127.0.0.1:8001/api/compile/${workflowId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        nodes: nodes.value,
        edges: edges.value,
        inputData
      })
    })

    if (!response.body) throw new Error("No response body")
    
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.substring(6)
          try {
            const data = JSON.parse(dataStr)
            if (data.type === 'chunk') {
              await callback(data.content)
            } else if (data.type === 'error') {
              await callback(`\nError: ${data.message}\n`)
            } else if (data.type === 'done') {
              // stream finished
            }
          } catch(e) {
            console.error("SSE parsing error", e, dataStr)
          }
        }
      }
    }
  } catch (error: any) {
    Message.error('发布运行失败')
    await callback(`Error: ${error.message}`)
  } finally {
    isRunning.value = false
  }
}

onMounted(() => {
  fetchWorkflow()
})
</script>

<template>
  <div class="h-screen w-screen flex flex-col bg-[#f0f2f5] overflow-hidden relative font-sans">
    
    <!-- Floating Header -->
    <header class="app-region-drag absolute top-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-md border border-gray-200/80 rounded-2xl shadow-sm flex items-center px-2 py-1.5 h-12 z-50 min-w-[500px] justify-between transition-all hover:shadow-md">
      <div class="flex items-center gap-2 pl-1">
        <router-link to="/console/workflows" class="text-gray-400 hover:text-gray-700 transition flex items-center bg-gray-50 hover:bg-gray-100 p-1.5 rounded-xl">
          <ChevronLeft :size="18" />
        </router-link>
        <div class="w-px h-5 bg-gray-200 mx-1"></div>
        <div class="flex items-center gap-2">
          <span class="text-xs font-semibold text-gray-400">控制台</span>
          <span class="text-gray-300">/</span>
          <input 
            v-model="workflowName" 
            class="text-sm font-bold text-gray-800 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-blue-100 rounded px-2 w-32 focus:w-48 transition-all h-8"
          />
        </div>
      </div>
      
      <div class="flex items-center gap-2 pr-1">
        <button @click="saveWorkflow" :disabled="isSaving" class="px-4 py-1.5 bg-gray-50 text-gray-600 rounded-xl hover:bg-gray-100 transition text-xs font-semibold flex items-center gap-1.5 border border-gray-200/60 disabled:opacity-50">
          <Loader2 v-if="isSaving" :size="14" class="animate-spin" />
          <Save v-else :size="14" /> {{ isSaving ? '保存中' : '保存' }}
        </button>
        <button @click="showDebugPanel = true" class="px-5 py-1.5 bg-blue-600 text-white rounded-xl shadow-sm shadow-blue-200 hover:bg-blue-700 transition text-xs font-semibold flex items-center gap-1.5 disabled:opacity-70">
          <PlayCircle :size="16" /> 调试
        </button>
      </div>
    </header>

    <!-- Canvas -->
    <div class="flex-1 w-full h-full relative" @dragover="onDragOver" @drop="onDrop">
      <VueFlow 
        v-model:nodes="nodes" 
        v-model:edges="edges" 
        :node-types="nodeTypes"
        @nodeClick="onNodeClick"
        @paneClick="onPaneClick"
        :nodes-draggable="true"
        :nodes-connectable="true"
        :elements-selectable="true"
        :delete-key-code="'Backspace'"
        :default-zoom="0.8"
        :min-zoom="0.2"
        :max-zoom="2"
      >
        <Background pattern-color="#94a3b8" :gap="20" :size="1.5" variant="dots" />
        <Controls class="bg-white/80 backdrop-blur-sm border-gray-200 shadow-sm rounded-xl overflow-hidden mb-4" />
        <MiniMap class="border-gray-200 shadow-sm rounded-xl mb-4 bg-white/80 backdrop-blur-sm" />
      </VueFlow>

      <!-- Floating Sidebar -->
      <Sidebar class="absolute left-6 top-24 z-40 shadow-xl border border-gray-200/60 rounded-2xl bg-white/80 backdrop-blur-xl" />

      <!-- Drawer Properties Panel -->
      <transition name="slide-fade">
        <PropertiesPanel 
          v-if="selectedNode && !showDebugPanel"
          :node="selectedNode" 
          @update:node="updateSelectedNode"
          class="absolute right-6 top-24 z-40 shadow-2xl border border-gray-200/60 rounded-2xl bg-white/95 backdrop-blur-xl max-h-[calc(100vh-140px)]"
        />
      </transition>

      <!-- Debug Panel -->
      <transition name="slide-fade-right">
        <DebugPanel 
          v-if="showDebugPanel"
          :isRunning="isRunning"
          @close="showDebugPanel = false"
          @run="compileGraph"
        />
      </transition>
    </div>
  </div>
</template>

<style>
.slide-fade-enter-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.slide-fade-leave-active {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateX(20px);
  opacity: 0;
}

.slide-fade-right-enter-active,
.slide-fade-right-leave-active {
  transition: transform 0.3s ease-in-out;
}
.slide-fade-right-enter-from,
.slide-fade-right-leave-to {
  transform: translateX(100%);
}
</style>
