<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import request from '../utils/request'
import { Message } from '../utils/message'
import { Confirm } from '../utils/confirm'
import { Plus, Trash2, Edit, Upload, Download } from 'lucide-vue-next'

const router = useRouter()
const workflows = ref<any[]>([])

const fetchWorkflows = async () => {
  try {
    const res = await request.get('/api/workflows')
    workflows.value = res.data
  } catch (error) {
    Message.error('加载工作流失败')
  }
}

const createWorkflow = async () => {
  try {
    const res = await request.post('/api/workflows', {
      name: `新建工作流 ${new Date().toLocaleTimeString()}`,
      nodes: [],
      edges: []
    })
    Message.success('工作流创建成功')
    router.push(`/console/workflows/${res.data.id}/editor`)
  } catch (error) {
    Message.error('创建失败，请稍后重试')
  }
}

const deleteWorkflow = async (id: number) => {
  const confirmed = await Confirm('删除工作流', '您确定要彻底删除这个工作流吗？此操作无法撤销。')
  if (confirmed) {
    try {
      await request.delete(`/api/workflows/${id}`)
      Message.success('删除成功')
      fetchWorkflows()
    } catch (error) {
      Message.error('删除失败，请稍后重试')
    }
  }
}
const fileInput = ref<HTMLInputElement | null>(null)

const triggerImport = () => {
  if (fileInput.value) fileInput.value.click()
}

const onFileImport = async (event: Event) => {
  const target = event.target as HTMLInputElement
  if (!target.files || target.files.length === 0) return
  const file = target.files[0]
  
  try {
    const text = await file.text()
    const data = JSON.parse(text)
    
    if (!data.name || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
      Message.error('无效的工作流文件格式')
      return
    }
    
    await request.post('/api/workflows', {
      name: data.name.includes('导出') ? data.name : `${data.name} (导入)`,
      nodes: data.nodes,
      edges: data.edges
    })
    
    Message.success('导入成功')
    fetchWorkflows()
  } catch (error) {
    Message.error('导入失败，请检查文件内容')
  } finally {
    if (fileInput.value) fileInput.value.value = ''
  }
}

const exportWorkflow = (wf: any) => {
  const dataStr = JSON.stringify({
    name: wf.name,
    nodes: wf.nodes,
    edges: wf.edges
  }, null, 2)
  const blob = new Blob([dataStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `workflow_${wf.name}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  Message.success('导出成功')
}

onMounted(() => {
  fetchWorkflows()
})
</script>

<template>
  <div class="h-full flex flex-col overflow-y-auto">
    <div class="max-w-6xl w-full mx-auto p-8 mt-4">
      <div class="flex items-center justify-between mb-8">
        <div>
          <h2 class="text-2xl font-bold text-gray-800">我的工作流 ({{ workflows.length }})</h2>
          <p class="text-gray-500 text-sm mt-1">管理和编排您的所有智能体工作流</p>
        </div>
        <div class="flex items-center gap-3">
          <button @click="triggerImport" class="px-5 py-2.5 bg-white text-blue-600 border border-blue-200 rounded-lg shadow-sm hover:shadow-md hover:bg-blue-50 transition font-medium flex items-center gap-2">
            <Upload :size="18" /> 导入工作流
          </button>
          <input type="file" ref="fileInput" accept=".json" class="hidden" @change="onFileImport" />
          <button @click="createWorkflow" class="px-5 py-2.5 bg-blue-600 text-white rounded-lg shadow-sm hover:shadow-md hover:bg-blue-700 transition font-medium flex items-center gap-2">
            <Plus :size="18" /> 新建工作流
          </button>
        </div>
      </div>
      
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div v-for="wf in workflows" :key="wf.id" class="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition group relative">
          <div class="flex justify-between items-start mb-4">
            <h3 class="font-bold text-lg text-gray-800 truncate" :title="wf.name">{{ wf.name }}</h3>
            <div class="absolute right-4 top-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
              <button @click="exportWorkflow(wf)" class="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-md transition" title="导出为JSON">
                <Download :size="18" />
              </button>
              <button @click="deleteWorkflow(wf.id)" class="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition" title="删除">
                <Trash2 :size="18" />
              </button>
            </div>
          </div>
          <div class="text-sm text-gray-500 mb-6 line-clamp-2">
            包含 {{ wf.nodes?.length || 0 }} 个节点, {{ wf.edges?.length || 0 }} 条连线
          </div>
          <div class="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
            <button @click="router.push(`/console/workflows/${wf.id}/editor`)" class="w-full py-2 bg-gray-50 text-blue-600 border border-gray-200 rounded font-medium hover:bg-blue-50 transition flex items-center justify-center gap-2">
              <Edit :size="16" /> 编排设计
            </button>
          </div>
        </div>
        
        <div v-if="workflows.length === 0" class="col-span-full py-16 text-center text-gray-500 bg-white rounded-2xl border border-dashed border-gray-300">
          <div class="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Plus :size="24" class="text-gray-400" />
          </div>
          <p class="text-lg font-medium text-gray-700 mb-1">暂无工作流</p>
          <p class="text-sm text-gray-500 mb-4">点击右上角新建一个您的智能体编排</p>
        </div>
      </div>
    </div>
  </div>
</template>
