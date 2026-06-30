<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import request from '../utils/request'
import { Message } from '../utils/message'
import { Confirm } from '../utils/confirm'
import { Plus, Trash2, Edit, Bot, Zap, History, X, Download, UploadCloud, Activity, Loader2, FileText, DownloadCloud } from 'lucide-vue-next'
import { marked } from 'marked'

const router = useRouter()
const agents = ref<any[]>([])

const fetchAgents = async () => {
  try {
    const res = await request.get('/api/agents')
    agents.value = res.data
  } catch (error) {
    Message.error('加载智能体列表失败')
  }
}

const formatDate = (dateStr: string) => {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const createAgent = async () => {
  try {
    const res = await request.post('/api/agents', {
      name: `新建智能体 ${new Date().toLocaleTimeString()}`
    })
    Message.success('智能体创建成功')
    router.push(`/console/agents/${res.data.id}/config`)
  } catch (error) {
    Message.error('创建失败，请稍后重试')
  }
}

const deleteAgent = async (id: number) => {
  const confirmed = await Confirm('删除智能体', '您确定要彻底删除这个智能体吗？此操作无法撤销。')
  if (confirmed) {
    try {
      await request.delete(`/api/agents/${id}`)
      Message.success('删除成功')
      fetchAgents()
    } catch (error) {
      Message.error('删除失败，请稍后重试')
    }
  }
}

const exportAgent = async (agent: any) => {
  try {
    const res = await request.get(`/api/agents/${agent.id}/export`)
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `agent_${agent.name}_export.json`
    a.click()
    URL.revokeObjectURL(url)
    Message.success('导出成功')
  } catch (error) {
    Message.error('导出失败')
  }
}

const fileInput = ref<HTMLInputElement | null>(null)
const triggerImport = () => {
  fileInput.value?.click()
}
const handleImport = async (e: Event) => {
  const target = e.target as HTMLInputElement
  if (!target.files?.length) return
  const file = target.files[0]
  const reader = new FileReader()
  reader.onload = async (ev) => {
    try {
      const payload = JSON.parse(ev.target?.result as string)
      const res = await request.post('/api/agents/import', payload)
      Message.success('导入成功')
      fetchAgents()
      target.value = '' // reset
    } catch (err) {
      Message.error('导入失败，请检查文件格式')
    }
  }
  reader.readAsText(file)
}

onMounted(() => {
  fetchAgents()
})

const showHistoryModal = ref(false)
const historyAgentId = ref<number | null>(null)
const historyDates = ref<string[]>([])
const selectedDate = ref('')
const historyContent = ref('')

const openHistory = async (agentId: number) => {
  historyAgentId.value = agentId
  showHistoryModal.value = true
  selectedDate.value = ''
  historyContent.value = ''
  try {
    const res = await request.get(`/api/agents/${agentId}/logs`)
    historyDates.value = res.data
    if (historyDates.value.length > 0) {
      selectHistoryDate(historyDates.value[0])
    }
  } catch (err) {
    Message.error('加载历史会话列表失败')
  }
}

const selectHistoryDate = async (date: string) => {
  selectedDate.value = date
  historyContent.value = '<div class="text-gray-500 py-4">加载中...</div>'
  try {
    const res = await request.get(`/api/agents/${historyAgentId.value}/logs/${date}`)
    historyContent.value = marked(res.data) as string
  } catch (err) {
    Message.error('加载会话内容失败')
    historyContent.value = '<div class="text-red-500 py-4">加载失败</div>'
  }
}

const showRunLogsModal = ref(false)
const isLoadingLogs = ref(false)
const runLogs = ref<any[]>([])
const currentRunLogAgentId = ref<number | null>(null)

const fetchRunLogs = async (agentId: number) => {
  isLoadingLogs.value = true
  try {
    const res = await request.get(`/api/agents/${agentId}/runs`)
    runLogs.value = res.data || []
  } catch (error) {
    Message.error('无法加载运行记录')
  } finally {
    isLoadingLogs.value = false
  }
}

const openRunLogs = (agentId: number) => {
  currentRunLogAgentId.value = agentId
  showRunLogsModal.value = true
  fetchRunLogs(agentId)
}

const closeRunLogs = () => {
  showRunLogsModal.value = false
}

const parseArtifacts = (artifactsStr: string) => {
  if (!artifactsStr) return []
  try {
    return JSON.parse(artifactsStr)
  } catch (e) {
    return []
  }
}

const openFile = async (filePath: string) => {
  try {
    const url = `http://127.0.0.1:8001${filePath}`
    const response = await fetch(url)
    if (!response.ok) throw new Error('Download failed')
    const blob = await response.blob()
    const objectUrl = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = filePath.split('/').pop() || 'download'
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(objectUrl)
    document.body.removeChild(a)
  } catch (err) {
    console.error('Failed to download file:', err)
    window.open(`http://127.0.0.1:8001${filePath}`, '_blank')
  }
}

const clearRunLogs = async () => {
  if (!currentRunLogAgentId.value) return
  try {
    await request.delete(`/api/agents/${currentRunLogAgentId.value}/runs`)
    Message.success('运行记录已清空')
    runLogs.value = []
  } catch (error) {
    Message.error('清空失败')
  }
}
</script>

<template>
  <div class="h-full bg-gray-50/50 p-8 overflow-y-auto">
    <div class="max-w-7xl mx-auto">
      <div class="flex items-center justify-between mb-8">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">智能体引擎</h1>
          <p class="text-gray-500 mt-1">基于 AgentScope 构建拥有长期记忆与工具调度能力的定制化智能体。</p>
        </div>
        <div class="flex items-center gap-3">
          <input type="file" ref="fileInput" class="hidden" accept=".json" @change="handleImport" />
          <button @click="triggerImport" class="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition shadow-sm hover:shadow">
            <UploadCloud :size="18" /> 导入智能体
          </button>
          <button @click="createAgent" class="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition shadow-sm hover:shadow">
            <Plus :size="18" /> 创建智能体
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <div v-for="agent in agents" :key="agent.id" class="bg-white rounded-2xl p-6 border border-gray-200 hover:border-blue-300 hover:shadow-lg transition-all duration-300 group flex flex-col h-full cursor-pointer" @click="router.push(`/console/agents/${agent.id}/config`)">
          <div class="flex justify-between items-start mb-4">
            <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white shadow-inner">
              <Bot :size="24" />
            </div>
            <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition">
              <button @click.stop="openRunLogs(agent.id)" class="text-gray-400 hover:text-pink-500 hover:bg-pink-50 p-2 rounded-lg transition" title="后台运行记录">
                <Activity :size="18" />
              </button>
              <button @click.stop="exportAgent(agent)" class="text-gray-400 hover:text-blue-500 hover:bg-blue-50 p-2 rounded-lg transition" title="导出智能体">
                <Download :size="18" />
              </button>
              <button @click.stop="deleteAgent(agent.id)" class="text-gray-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg transition" title="删除智能体">
                <Trash2 :size="18" />
              </button>
            </div>
          </div>
          
          <h3 class="text-lg font-bold text-gray-900 mb-2 truncate" :title="agent.name">{{ agent.name }}</h3>
          <p class="text-sm text-gray-500 mb-6 line-clamp-2 flex-grow">
            {{ (agent.description && agent.description !== 'null') ? agent.description : '为您的业务量身定制的智能助手...' }}
          </p>
          
          <div class="flex items-center gap-2 text-xs text-gray-500 mb-4">
            <span class="px-2 py-1 bg-gray-100 rounded-md border border-gray-200 font-mono">{{ agent.model_name || 'gpt-4o' }}</span>
            <span v-if="agent.memory_enabled" class="px-2 py-1 bg-green-50 text-green-600 rounded-md border border-green-100">拥有长期记忆</span>
          </div>

          <div class="mt-auto flex justify-between items-center text-[11px] text-gray-400 mb-4">
            <span>创建: {{ formatDate(agent.created_at) }}</span>
            <span>更新: {{ formatDate(agent.updated_at) }}</span>
          </div>

          <div class="pt-4 border-t border-gray-100 flex gap-2">
            <button @click.stop="router.push(`/run/${agent.id}`)" class="flex-1 py-2 bg-indigo-600 text-white rounded font-medium hover:bg-indigo-700 transition flex items-center justify-center gap-2">
              <Zap :size="16" /> 运行
            </button>
            <button @click.stop="openHistory(agent.id)" class="flex-1 py-2 bg-teal-50 text-teal-600 border border-teal-100 rounded font-medium hover:bg-teal-100 transition flex items-center justify-center gap-2">
              <History :size="16" /> 历史
            </button>
            <button @click.stop="router.push(`/console/agents/${agent.id}/config`)" class="flex-1 py-2 bg-blue-50 text-blue-600 border border-blue-100 rounded font-medium hover:bg-blue-100 transition flex items-center justify-center gap-2">
              <Edit :size="16" /> 调试
            </button>
          </div>
        </div>
        
        <div v-if="agents.length === 0" class="col-span-full py-20 text-center text-gray-500 bg-white rounded-2xl border border-dashed border-gray-300">
          <Bot :size="48" class="mx-auto text-gray-300 mb-4" />
          <p class="text-lg font-medium text-gray-900 mb-1">暂无智能体</p>
          <p class="text-sm">点击右上角按钮创建一个全新的智能体吧</p>
        </div>
      </div>
    </div>

    <!-- 历史会话查看 Modal -->
    <div v-if="showHistoryModal" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div class="bg-white rounded-2xl w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden shadow-2xl ring-1 ring-slate-900/10" @click.stop>
        <!-- Modal Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <h2 class="text-lg font-bold text-gray-800 flex items-center gap-2">
            <History class="text-indigo-500" :size="20" /> 历史会话记录
          </h2>
          <button @click="showHistoryModal = false" class="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition">
            <X :size="20" />
          </button>
        </div>

        <!-- Modal Body -->
        <div class="flex flex-1 overflow-hidden">
          <!-- 左侧日期列表 -->
          <div class="w-64 border-r border-gray-100 bg-gray-50 overflow-y-auto p-4 space-y-2">
            <div v-if="historyDates.length === 0" class="text-sm text-gray-500 text-center py-10">
              暂无历史记录
            </div>
            <button v-for="date in historyDates" :key="date" @click="selectHistoryDate(date)"
              class="w-full text-left px-4 py-3 rounded-xl transition text-sm font-medium flex items-center gap-2"
              :class="selectedDate === date ? 'bg-white shadow-sm border border-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100 border border-transparent'">
              <span class="w-2 h-2 rounded-full" :class="selectedDate === date ? 'bg-indigo-500' : 'bg-gray-300'"></span>
              {{ date }}
            </button>
          </div>

          <!-- 右侧内容展示区 -->
          <div class="flex-1 bg-white overflow-y-auto p-6">
            <div v-if="selectedDate" class="prose prose-sm max-w-none prose-indigo prose-pre:bg-gray-50 prose-pre:text-gray-800 prose-pre:border prose-pre:border-gray-200" v-html="historyContent">
            </div>
            <div v-else class="h-full flex flex-col items-center justify-center text-gray-400">
              <History :size="48" class="mb-4 text-gray-200" />
              <p>请在左侧选择日期以查看记录</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Run Logs Modal -->
    <div v-if="showRunLogsModal" @click.self="closeRunLogs" class="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-[200]">
      <div class="bg-white rounded-2xl shadow-xl w-[800px] h-[600px] flex flex-col overflow-hidden border border-gray-100">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-pink-50 to-white">
          <div class="flex items-center gap-2">
            <Activity class="text-pink-600" :size="20" />
            <h3 class="font-bold text-gray-800 text-base">后台运行记录</h3>
            <span class="text-xs text-gray-500 ml-2">最近 100 条记录</span>
          </div>
          <div class="flex items-center gap-3">
            <button @click="clearRunLogs" class="text-xs flex items-center gap-1 text-red-500 hover:text-red-700 px-2 py-1 rounded bg-red-50 hover:bg-red-100 transition">
              <Trash2 :size="14" /> 清空
            </button>
            <button type="button" @click.stop.prevent="closeRunLogs" class="text-gray-400 hover:text-gray-800 cursor-pointer p-2 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors z-50 relative">
              <X :size="20" class="pointer-events-none" />
            </button>
          </div>
        </div>
        
        <div class="flex-1 overflow-y-auto custom-scrollbar bg-gray-50 p-4">
          <div v-if="isLoadingLogs" class="flex justify-center py-10 text-gray-400">
            <Loader2 class="animate-spin" :size="24" />
          </div>
          <div v-else-if="runLogs.length === 0" class="text-center py-20 text-gray-400">
            暂无运行记录
          </div>
          <div v-else class="space-y-3">
            <div v-for="log in runLogs" :key="log.id" class="bg-white border rounded-xl p-4 flex flex-col gap-2 shadow-sm" :class="log.status === 'error' ? 'border-red-200' : 'border-gray-200'">
              <div class="flex justify-between items-center border-b border-gray-50 pb-2">
                <div class="flex items-center gap-2 text-xs">
                  <span v-if="log.status === 'success'" class="px-2 py-0.5 bg-green-100 text-green-700 rounded font-medium">成功</span>
                  <span v-else-if="log.status === 'running'" class="px-2 py-0.5 bg-blue-100 text-blue-700 rounded font-medium flex items-center gap-1"><Loader2 class="animate-spin" :size="10" /> 运行中</span>
                  <span v-else-if="log.status === 'error'" class="px-2 py-0.5 bg-red-100 text-red-700 rounded font-medium">失败</span>
                  <span class="text-gray-500">{{ new Date(log.created_at).toLocaleString() }}</span>
                </div>
                <span class="text-xs text-gray-400 font-mono">Run #{{ log.id }}</span>
              </div>
              
              <div v-if="log.status === 'error'" class="text-sm text-red-600 bg-red-50 p-2 rounded whitespace-pre-wrap font-mono">{{ log.error_msg }}</div>
              <div v-else class="flex flex-col gap-3">
                <!-- 入参 -->
                <div v-if="log.input_params" class="bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <div class="text-xs font-semibold text-gray-500 mb-1">入参</div>
                  <div class="text-sm text-gray-700 whitespace-pre-wrap">{{ log.input_params }}</div>
                </div>
                
                <!-- 出参 -->
                <div class="bg-blue-50/30 rounded-lg p-3 border border-blue-100/50">
                  <div class="text-xs font-semibold text-blue-500 mb-1">出参</div>
                  <div v-if="log.result" class="text-sm text-gray-800 whitespace-pre-wrap max-h-96 overflow-y-auto custom-scrollbar">{{ log.result }}</div>
                  <div v-else class="text-xs text-gray-400 italic">无输出内容</div>
                </div>

                <!-- 产出文件 -->
                <div v-if="parseArtifacts(log.artifacts).length > 0" class="bg-orange-50/30 rounded-lg p-3 border border-orange-100/50">
                  <div class="text-xs font-semibold text-orange-500 mb-2">产出文件</div>
                  <div class="flex flex-wrap gap-2">
                    <div v-for="(file, idx) in parseArtifacts(log.artifacts)" :key="idx" 
                      @click="openFile(file.file_path)"
                      class="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-md cursor-pointer hover:border-orange-300 hover:shadow-sm transition group">
                      <FileText class="text-orange-400" :size="16" />
                      <span class="text-xs text-gray-700 truncate max-w-[150px]">{{ file.file_name }}</span>
                      <DownloadCloud class="text-gray-400 opacity-0 group-hover:opacity-100 transition" :size="14" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
