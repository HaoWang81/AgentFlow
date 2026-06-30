<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { Server, Wrench, BookOpen, BrainCircuit, Boxes, Plus, Search, MoreVertical, Edit2, Trash2, ChevronRight, ChevronDown, Activity, Terminal, Globe, Play, Circle, FileCode2, FileText, Folder, FolderOpen, UploadCloud, Sparkles } from 'lucide-vue-next'
import request from '../utils/request'
import { marked } from 'marked'
import { useRouter } from 'vue-router'

const router = useRouter()

const tabs = [
  { id: 'models', name: '模型管理', icon: BrainCircuit },
  { id: 'skills', name: '预设技能', icon: Wrench },
  { id: 'knowledge_bases', name: '知识库', icon: BookOpen },
  { id: 'mcp_servers', name: 'MCP 服务', icon: Server },
  { id: 'tools', name: '扩展工具', icon: Boxes }
]

const renderMarkdown = (text: string) => {
  if (!text) return ''
  // 美化 YAML Frontmatter 为代码块
  const formattedText = text.replace(/^---\r?\n([\s\S]*?)\r?\n---/, '```yaml\n$1\n```')
  return marked.parse(formattedText) as string
}

const formatDate = (dateStr: string) => {
  if (!dateStr) return '-'
  try {
    return dateStr.replace('T', ' ').substring(0, 16)
  } catch (e) {
    return dateStr
  }
}

const activeTab = ref('models')
const loading = ref(false)
const items = ref<any[]>([])
const searchQuery = ref('')

const expandedPaths = ref(new Set<string>())

const toggleFolder = (path: string) => {
  const newSet = new Set(expandedPaths.value)
  if (newSet.has(path)) {
    newSet.delete(path)
  } else {
    newSet.add(path)
  }
  expandedPaths.value = newSet
}

const skillFileTree = computed(() => {
  if (activeTab.value !== 'skills' || !formData.value.files) return []
  
  const nodes = new Map()
  const root: any[] = []
  
  formData.value.files.forEach((f: any) => {
    const parts = f.path.split('/')
    let currentPath = ''
    
    parts.forEach((part: string, index: number) => {
      const isFile = index === parts.length - 1
      const parentPath = currentPath
      currentPath = currentPath ? `${currentPath}/${part}` : part
      
      if (!nodes.has(currentPath)) {
        const node = {
          name: part,
          path: currentPath,
          isFile,
          file: isFile ? f : null,
          depth: index,
          children: []
        }
        nodes.set(currentPath, node)
        
        if (parentPath && nodes.has(parentPath)) {
          nodes.get(parentPath).children.push(node)
        } else {
          root.push(node)
        }
      }
    })
  })
  
  const sortNodes = (arr: any[]) => {
    arr.sort((a, b) => {
      if (a.isFile !== b.isFile) return a.isFile ? 1 : -1
      return a.name.localeCompare(b.name)
    })
    arr.forEach(node => {
      if (!node.isFile) sortNodes(node.children)
    })
  }
  sortNodes(root)
  
  const flatten = (arr: any[]): any[] => {
    let result: any[] = []
    arr.forEach(node => {
      result.push(node)
      if (!node.isFile && expandedPaths.value.has(node.path)) {
        result = result.concat(flatten(node.children))
      }
    })
    return result
  }
  
  return flatten(root)
})

const filteredItems = computed(() => {
  if (!searchQuery.value.trim()) return items.value
  const q = searchQuery.value.toLowerCase()
  return items.value.filter(item => 
    (item.name && item.name.toLowerCase().includes(q)) ||
    (item.model_name && item.model_name.toLowerCase().includes(q)) ||
    (item.description && item.description.toLowerCase().includes(q))
  )
})

const fetchItems = async () => {
  loading.value = true
  try {
    const { data } = await request.get(`/api/${activeTab.value}`)
    items.value = data
  } catch (error) {
    console.error(`Error fetching ${activeTab.value}:`, error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchItems()
})

const handleTabChange = (tabId: string) => {
  activeTab.value = tabId
  searchQuery.value = ''
  fetchItems()
}

const handleDelete = async (id: number) => {
  if (!confirm('确认要删除这个资源吗？')) return
  try {
    await request.delete(`/api/${activeTab.value}/${id}`)
    fetchItems()
  } catch (error) {
    console.error('Delete error:', error)
  }
}

const pingingStates = ref<Record<number, boolean>>({})
const mcpTools = ref<Record<number, any[]>>({})
const expandedMcp = ref<number | null>(null)

const pingMcpServer = async (item: any) => {
  pingingStates.value[item.id] = true
  try {
    const { data } = await request.post(`/api/mcp/ping/${item.id}`)
    mcpTools.value[item.id] = data.tools
    expandedMcp.value = item.id
  } catch (err: any) {
    alert(`❌ 连接失败：\n${err.response?.data?.error || err.message}`)
  } finally {
    pingingStates.value[item.id] = false
  }
}

const testModel = async () => {
  if (!formData.value.model_name) {
    alert('请先填写模型代码 (Model Name)')
    return
  }
  isTesting.value = true
  try {
    const adv: any = {}
    try { adv.headers = JSON.parse(formData.value.headers || '{}') } catch(e) {}
    try { adv.body = JSON.parse(formData.value.body || '{}') } catch(e) {}
    
    const res = await fetch('/api/models/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model_name: formData.value.model_name,
        api_key: formData.value.api_key,
        base_url: formData.value.base_url,
        advanced_config: adv
      })
    })
    const json = await res.json()
    if (json.success) {
      alert('✅ 测试通过！连接成功。')
    } else {
      alert('❌ 测试失败：\\n' + json.error)
    }
  } catch(e: any) {
    alert('❌ 网络或服务异常：\\n' + e.message)
  } finally {
    isTesting.value = false
  }
}

const isTestingMcp = ref(false)
const testMcp = async () => {
  isTestingMcp.value = true
  try {
    const { data } = await request.post('/api/mcp/test', formData.value)
    alert(`✅ 测试成功！扫描到 ${data.tools.length} 个扩展工具。`)
  } catch(e: any) {
    alert(`❌ 测试失败：${e.response?.data?.error || e.message}`)
  } finally {
    isTestingMcp.value = false
  }
}

const isTestingTools = ref(false)
const toolsTestArgs = ref('{}')
const toolsTestResultOutput = ref('')
const testTools = async () => {
  isTestingTools.value = true
  toolsTestResultOutput.value = ''
  try {
    const { data } = await request.post('/api/tools/run', { code: formData.value.code, test_args: toolsTestArgs.value })
    toolsTestResultOutput.value = typeof data.result === 'string' ? data.result : JSON.stringify(data.result, null, 2)
  } catch(e: any) {
    toolsTestResultOutput.value = `❌ 执行失败：\n${e.response?.data?.error || e.message}`
  } finally {
    isTestingTools.value = false
  }
}

const isGeneratingTool = ref(false)
const toolPrompt = ref('')

const generateTool = async () => {
  if (!toolPrompt.value.trim()) return
  isGeneratingTool.value = true
  try {
    const { data } = await request.post('/api/generate/tool', { instruction: toolPrompt.value })
    if (data.success && data.tool) {
      formData.value.name = data.tool.name || formData.value.name
      formData.value.description = data.tool.description || formData.value.description
      formData.value.parameters = typeof data.tool.parameters === 'string' ? data.tool.parameters : JSON.stringify(data.tool.parameters, null, 2)
      formData.value.code = data.tool.code || formData.value.code
      alert('✨ 工具生成成功，您可以直接运行沙箱测试。')
    } else {
      alert(`❌ 生成失败：${data.error || '未知错误'}`)
    }
  } catch (err: any) {
    alert(`❌ 生成失败：${err.response?.data?.error || err.message}`)
  } finally {
    isGeneratingTool.value = false
  }
}

const isGeneratingSkill = ref(false)
const skillPrompt = ref('')

const generateSkill = async () => {
  if (!skillPrompt.value.trim()) return
  isGeneratingSkill.value = true
  try {
    const { data } = await request.post('/api/generate/skill', { instruction: skillPrompt.value })
    if (data.success && data.skill) {
      alert('✨ 技能生成并保存成功！')
      showModal.value = false
      fetchItems()
      skillPrompt.value = ''
    } else {
      alert(`❌ 生成失败：${data.error || '未知错误'}`)
    }
  } catch (err: any) {
    alert(`❌ 生成失败：${err.response?.data?.error || err.message}`)
  } finally {
    isGeneratingSkill.value = false
  }
}

const selectedSkillFile = ref<any>(null)
const isImportingSkill = ref(false)
const skillImportType = ref('local')
const skillFileInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const gitConfig = ref({ repo_url: '', branch: '', token: '' })

const triggerFileInput = () => {
  if (skillFileInput.value) skillFileInput.value.click()
}

const handleFileSelected = (e: Event) => {
  const target = e.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    selectedFile.value = target.files[0]
  }
}

const importSkill = async () => {
  isImportingSkill.value = true
  try {
    if (skillImportType.value === 'local') {
      if (!selectedFile.value) return alert('请先选择要上传的文件')
      const formData = new FormData()
      formData.append('file', selectedFile.value)
      await request.post('/api/skills/upload-local', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
    } else {
      if (!gitConfig.value.repo_url) return alert('请输入仓库地址')
      await request.post('/api/skills/git-pull', gitConfig.value)
    }
    alert('✅ 导入技能成功！')
    showModal.value = false
    selectedFile.value = null
    gitConfig.value = { repo_url: '', branch: '', token: '' }
    fetchItems()
  } catch(e: any) {
    alert(`❌ 导入失败：${e.response?.data?.error || e.message}`)
  } finally {
    isImportingSkill.value = false
  }
}

const showModal = ref(false)
const isEditing = ref(false)
const showAdvanced = ref(false)
const isTesting = ref(false)
const currentId = ref<number | null>(null)
const formData = ref<any>({})



const openModal = (item?: any) => {
  toolsTestResultOutput.value = ''
  if (activeTab.value === 'knowledge_bases' && item) {
    router.push(`/console/knowledge-bases/${item.id}`)
    return
  }

  isEditing.value = !!item
  if (item) {
    currentId.value = item.id
    // Clone and stringify JSON fields for editing
    const data = { ...item }
    if (data.default_config) data.default_config = JSON.stringify(data.default_config, null, 2)
    if (data.config && activeTab.value !== 'knowledge_bases') data.config = JSON.stringify(data.config, null, 2)
    if (data.parameters) data.parameters = JSON.stringify(data.parameters, null, 2)
    
    // Handle advanced_config headers/body
    let adv = data.advanced_config || {}
    if (typeof adv === 'string') {
      try { adv = JSON.parse(adv) } catch(e) {}
    }
    data.headers = adv.headers ? JSON.stringify(adv.headers, null, 2) : '{}'
    data.body = adv.body ? JSON.stringify(adv.body, null, 2) : '{}'
    
    // Parse files for skills
    if (activeTab.value === 'skills') {
      if (typeof data.files === 'string' && data.files) {
        try {
          data.files = JSON.parse(data.files)
        } catch(e) {
          data.files = []
        }
      }
      if (data.files && data.files.length > 0) {
        selectedSkillFile.value = data.files.find((f: any) => f.path.toLowerCase() === 'skill.md' || f.path.toLowerCase().endsWith('/skill.md')) || data.files[0]
        
        // Auto expand all folders
        const dirs = new Set<string>()
        data.files.forEach((f: any) => {
          const parts = f.path.split('/')
          let cur = ''
          for (let i = 0; i < parts.length - 1; i++) {
            cur = cur ? `${cur}/${parts[i]}` : parts[i]
            dirs.add(cur)
          }
        })
        expandedPaths.value = dirs
      } else {
        selectedSkillFile.value = null
      }
    }
    
    formData.value = data
  } else {
    currentId.value = null
    formData.value = { name: '', description: '' }
    if (activeTab.value === 'models') {
      formData.value = { name: '', model_name: '', base_url: '', api_key: '', headers: '{}', body: '{}', is_default: 0 }
    } else if (activeTab.value === 'mcp_servers') {
      formData.value = { name: '', description: '', connection_type: 'stdio', command: '', args: '', env: '{}', url: '' }
    } else if (activeTab.value === 'knowledge_bases') {
      formData.value = { name: '', description: '', kb_type: 'local' }
    }
  }
  
  if (activeTab.value === 'mcp_servers' && item) {
    let config = item.config || {}
    if (typeof config === 'string') {
      try { config = JSON.parse(config) } catch(e) {}
    }
    formData.value.connection_type = config.type || 'stdio'
    formData.value.command = config.command || ''
    formData.value.args = (config.args || []).join(', ')
    formData.value.env = JSON.stringify(config.env || {}, null, 2)
    formData.value.url = item.url || ''
  }
  showAdvanced.value = false
  showModal.value = true
}

const saveModal = async () => {
  if (!formData.value.name || !formData.value.name.trim()) {
    alert('请填写名称！')
    return
  }

  try {
    const payload = { ...formData.value }
    // Parse JSON fields back to objects if they are strings
    if (payload.default_config && typeof payload.default_config === 'string') {
      try { payload.default_config = JSON.parse(payload.default_config) } catch(e) {}
    }
    if (payload.config && typeof payload.config === 'string' && activeTab.value !== 'knowledge_bases') {
      try { payload.config = JSON.parse(payload.config) } catch(e) {}
    }
    if (payload.parameters && typeof payload.parameters === 'string') {
      try { payload.parameters = JSON.parse(payload.parameters) } catch(e) {}
    }

    if (activeTab.value === 'models') {
      const adv: any = {}
      try { adv.headers = JSON.parse(payload.headers || '{}') } catch(e) {}
      try { adv.body = JSON.parse(payload.body || '{}') } catch(e) {}
      payload.advanced_config = adv
      delete payload.headers
      delete payload.body
    }
    
    if (activeTab.value === 'mcp_servers') {
      payload.config = {
        type: payload.connection_type,
        command: payload.command,
        args: (payload.args || '').split(',').map((a: string) => a.trim()).filter((a: string) => a),
        env: payload.env ? JSON.parse(payload.env) : {}
      }
      payload.url = payload.connection_type === 'sse' ? payload.url : ''
      delete payload.connection_type
      delete payload.command
      delete payload.args
      delete payload.env
    }

    if (activeTab.value === 'knowledge_bases') {
      // For new KB, initialize config with selected type
      if (!isEditing.value) {
        payload.config = JSON.stringify({ type: payload.kb_type || 'local', url: '', method: 'GET', headers: '{}', body: '', json_path: '$.' })
      }
      delete payload.kb_type
    }

    if (isEditing.value) {
      await request.put(`/api/${activeTab.value}/${currentId.value}`, payload)
    } else {
      const res = await request.post(`/api/${activeTab.value}`, payload)
      if (activeTab.value === 'knowledge_bases') {
        showModal.value = false
        router.push(`/console/knowledge-bases/${res.data.id}`)
        return
      }
    }
    showModal.value = false
    fetchItems()
  } catch (error: any) {
    const errorMsg = error.response?.data?.error || error.message || '未知错误'
    alert(`保存失败: ${errorMsg}\n请检查填写内容。`)
    console.error('Save error:', error)
  }
}
</script>

<template>
  <div class="flex-1 flex flex-col bg-[#fbfcfd] h-full overflow-hidden">
    <!-- Header -->
    <header class="bg-white border-b border-gray-200 px-8 py-6 shrink-0">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 tracking-tight">资源中心</h1>
          <p class="text-gray-500 text-sm mt-1">集中管理空间下的所有大模型、技能、知识库和工具依赖</p>
        </div>
        <button @click="openModal()" class="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium shadow-sm shadow-blue-200">
          <Plus :size="18" />
          <span>添加{{ tabs.find(t => t.id === activeTab)?.name }}</span>
        </button>
      </div>

      <!-- Tabs -->
      <div class="flex gap-1 border-b border-gray-100">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="handleTabChange(tab.id)"
          class="flex items-center gap-2 px-4 py-2.5 border-b-2 font-medium text-sm transition-colors"
          :class="[
            activeTab === tab.id 
              ? 'border-blue-600 text-blue-600' 
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          ]"
        >
          <component :is="tab.icon" :size="16" />
          {{ tab.name }}
        </button>
      </div>
    </header>

    <!-- Main Content -->
    <main class="flex-1 overflow-y-auto p-8">
      <div class="max-w-7xl mx-auto">
        <!-- Toolbar -->
        <div class="flex items-center justify-between mb-6">
          <div class="relative w-72">
            <Search :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              v-model="searchQuery"
              type="text" 
              placeholder="搜索当前资源..." 
              class="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white shadow-sm"
            >
          </div>
          <div class="text-sm text-gray-500 font-medium">
            共 {{ filteredItems.length }} 项
          </div>
        </div>

        <!-- Loading State -->
        <div v-if="loading" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div v-for="i in 3" :key="i" class="bg-white rounded-xl border border-gray-100 p-6 shadow-sm animate-pulse">
            <div class="h-6 bg-gray-100 rounded w-1/3 mb-4"></div>
            <div class="h-4 bg-gray-100 rounded w-2/3 mb-2"></div>
            <div class="h-4 bg-gray-100 rounded w-1/2"></div>
          </div>
        </div>

        <!-- Empty State -->
        <div v-else-if="filteredItems.length === 0" class="flex flex-col items-center justify-center py-20 bg-white border border-gray-200 border-dashed rounded-xl">
          <div class="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-4">
            <Boxes :size="32" />
          </div>
          <h3 class="text-lg font-medium text-gray-900 mb-1">暂无内容</h3>
          <p class="text-gray-500 text-sm mb-6">当前分类下还没有添加任何资源</p>
          <button @click="openModal()" class="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium shadow-sm">
            <Plus :size="16" />
            <span>立即添加</span>
          </button>
        </div>

        <!-- Grid View -->
        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div v-for="item in filteredItems" :key="item.id" class="group relative bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition p-5 flex flex-col">
            
            <div class="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition flex items-center gap-1 z-10 bg-white/90 backdrop-blur-sm p-1 rounded-lg border border-gray-100 shadow-sm">
              <button @click.stop="openModal(item)" class="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition" :title="activeTab === 'skills' ? '查看详情' : '编辑'">
                <BookOpen v-if="activeTab === 'skills'" :size="14" />
                <Edit2 v-else :size="14" />
              </button>
              <button @click.stop="handleDelete(item.id)" class="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md transition" title="删除">
                <Trash2 :size="14" />
              </button>
            </div>

            <div class="flex items-start justify-between mb-4">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-100 to-indigo-50 flex items-center justify-center text-blue-600 border border-blue-100 shadow-inner shrink-0">
                  <component :is="tabs.find(t => t.id === activeTab)?.icon" :size="20" />
                </div>
                <div class="min-w-0">
                  <h3 class="font-semibold text-gray-900 leading-tight flex items-center flex-wrap gap-2">
                    <span class="truncate">{{ item.name }}</span>
                    <span v-if="item.is_builtin" class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-100 shrink-0">
                      内置
                    </span>
                    <span v-if="item.is_default" class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-700 border border-green-100 shrink-0">
                      默认全局模型
                    </span>
                  </h3>
                  <p v-if="item.model_name" class="text-xs text-gray-500 mt-1 font-mono truncate">{{ item.model_name }}</p>
                  <p v-else-if="item.description" class="text-xs text-gray-500 mt-1 line-clamp-1">{{ item.description }}</p>
                </div>
              </div>
            </div>

            <div v-if="activeTab !== 'skills'" class="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 border border-gray-100 mt-auto mb-3">
              <div v-if="activeTab === 'models'" class="font-mono text-xs truncate text-gray-500">
                URL: {{ item.base_url || 'Default Provider URL' }}
              </div>
              <div v-else-if="activeTab === 'mcp_servers'" class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full" 
                        :class="(item.config && (typeof item.config === 'string' ? JSON.parse(item.config).type : item.config.type) === 'sse') ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-200 text-gray-700'">
                    <Terminal v-if="(item.config && (typeof item.config === 'string' ? JSON.parse(item.config).type : item.config.type) !== 'sse')" :size="12" />
                    <Globe v-else :size="12" />
                    {{ (item.config && (typeof item.config === 'string' ? JSON.parse(item.config).type : item.config.type) === 'sse') ? 'SSE' : 'Stdio' }}
                  </span>
                </div>
                <button 
                  @click.stop="pingMcpServer(item)"
                  class="flex items-center gap-1.5 px-3 py-1 bg-white border border-gray-200 hover:bg-green-50 hover:text-green-600 hover:border-green-200 rounded-md transition text-xs font-medium shadow-sm"
                  :disabled="pingingStates[item.id]"
                >
                  <span v-if="pingingStates[item.id]" class="inline-block w-3 h-3 border-2 border-green-600 border-t-transparent rounded-full animate-spin"></span>
                  <Activity v-else :size="14" />
                  {{ pingingStates[item.id] ? 'Ping...' : '测试连接' }}
                </button>
              </div>
              <div v-else-if="activeTab === 'knowledge_bases'" class="flex items-center justify-between text-xs text-gray-500">
                <div class="flex items-center gap-2">
                  <span class="inline-flex items-center gap-1 font-medium px-2 py-0.5 rounded-full" 
                        :class="(item.config && (typeof item.config === 'string' ? JSON.parse(item.config).type : item.config.type) === 'remote') ? 'bg-orange-50 text-orange-700' : 'bg-teal-50 text-teal-700'">
                    <Globe v-if="(item.config && (typeof item.config === 'string' ? JSON.parse(item.config).type : item.config.type) === 'remote')" :size="12" />
                    <Folder v-else :size="12" />
                    {{ (item.config && (typeof item.config === 'string' ? JSON.parse(item.config).type : item.config.type) === 'remote') ? '远程接口' : '本地文档' }}
                  </span>
                </div>
                <span>参数: {{ item.config ? '已配置' : '默认' }}</span>
              </div>
              <div v-else class="text-xs text-gray-500 truncate">
                {{ item.content || item.code || item.parameters || '没有描述信息' }}
              </div>
              
              <!-- MCP Tools Accordion -->
              <div v-if="activeTab === 'mcp_servers' && mcpTools[item.id]" class="mt-3 border-t border-gray-200 pt-3">
                <button @click="expandedMcp = expandedMcp === item.id ? null : item.id" class="flex items-center justify-between w-full text-xs font-medium text-gray-600 hover:text-blue-600 transition">
                  <div class="flex items-center gap-1.5">
                    <Boxes :size="14" />
                    已挂载 {{ mcpTools[item.id].length }} 个工具
                  </div>
                  <ChevronDown class="transition-transform" :class="{'rotate-180': expandedMcp === item.id}" :size="14" />
                </button>
                <div v-if="expandedMcp === item.id" class="mt-2 space-y-2 max-h-32 overflow-y-auto pr-1">
                  <div v-for="tool in mcpTools[item.id]" :key="tool.name" class="p-2 bg-white rounded border border-gray-100">
                    <div class="font-mono text-xs font-semibold text-gray-800">{{ tool.name }}</div>
                    <div class="text-[10px] text-gray-500 mt-1 leading-tight line-clamp-2" :title="tool.description">{{ tool.description || '无描述' }}</div>
                  </div>
                </div>
              </div>
            </div>

            <div class="border-t border-gray-100 pt-3 flex justify-between items-center text-[10px] text-gray-400 font-mono" :class="activeTab === 'skills' ? 'mt-auto' : ''">
              <div class="flex items-center gap-1"><span class="opacity-70">创建:</span> {{ formatDate(item.created_at) }}</div>
              <div class="flex items-center gap-1" v-if="item.updated_at"><span class="opacity-70">更新:</span> {{ formatDate(item.updated_at) }}</div>
            </div>
            
          </div>
        </div>
      </div>
    </main>

    <!-- Form Modal -->
    <div v-if="showModal" class="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[200]">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 class="text-lg font-bold text-gray-900">{{ activeTab === 'skills' && isEditing ? '查看技能详情' : (isEditing ? '编辑' : '添加') }}{{ tabs.find(t => t.id === activeTab)?.name }}</h3>
          <button @click="showModal = false" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div class="p-6 overflow-y-auto max-h-[70vh] space-y-4">
          
          <div v-if="activeTab === 'tools'" class="mb-4 p-4 bg-blue-50 border border-blue-100 rounded-xl">
            <label class="block text-sm font-semibold text-blue-800 mb-2 flex items-center gap-1.5">
              <Sparkles class="w-4 h-4 text-blue-600" /> AI 一句话生成工具
            </label>
            <div class="flex gap-2">
              <input v-model="toolPrompt" type="text" placeholder="例如：生成一个查看指定目录所有文件的工具" class="flex-1 p-2.5 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-400 outline-none text-sm bg-white" @keyup.enter="generateTool" />
              <button @click="generateTool" :disabled="isGeneratingTool" class="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg shadow-sm hover:bg-blue-700 transition disabled:opacity-50 flex items-center justify-center min-w-[80px]">
                <span v-if="isGeneratingTool" class="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span>
                {{ isGeneratingTool ? '生成中...' : '生成' }}
              </button>
            </div>
            <p class="text-xs text-blue-600/80 mt-2">提示：由配置的全局默认大模型驱动，生成后请注意检查代码依赖与安全性。</p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">名称 (Name)</label>
            <input v-model="formData.name" type="text" class="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-100 outline-none" required />
          </div>

          <template v-if="activeTab === 'models'">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">模型代码 (Model Name)</label>
              <input v-model="formData.model_name" type="text" placeholder="如 gpt-4o, claude-3" class="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-100 outline-none" required />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Base URL</label>
              <input v-model="formData.base_url" type="text" placeholder="如 https://api.openai.com/v1" class="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-100 outline-none" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">API Key</label>
              <input v-model="formData.api_key" type="password" class="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-100 outline-none" />
            </div>

            <div class="flex items-center gap-2 mt-4">
              <input type="checkbox" id="is_default" v-model="formData.is_default" :true-value="1" :false-value="0" class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
              <label for="is_default" class="text-sm text-gray-700 font-medium cursor-pointer">设为全局默认大模型</label>
            </div>
            <p class="text-xs text-gray-500 mt-1 ml-6">（其他如“AI自动生成提示词”等通用业务逻辑将默认调用此模型）</p>
            
            <div class="mt-4">
              <button type="button" @click="showAdvanced = !showAdvanced" class="flex items-center text-sm text-blue-600 hover:text-blue-800 transition mb-3 font-medium">
                <ChevronDown v-if="showAdvanced" class="w-4 h-4 mr-1"/>
                <ChevronRight v-else class="w-4 h-4 mr-1"/>
                高级设置 (Advanced Config)
              </button>
              
              <div v-show="showAdvanced" class="space-y-4 p-4 border border-blue-100 bg-blue-50/30 rounded-xl">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">自定义 Headers (JSON)</label>
                  <textarea v-model="formData.headers" rows="2" placeholder='{"Authorization": "Bearer XXX"}' class="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-100 outline-none font-mono text-xs"></textarea>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">自定义 Body (JSON)</label>
                  <textarea v-model="formData.body" rows="2" placeholder='{"stream": true}' class="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-100 outline-none font-mono text-xs"></textarea>
                </div>
              </div>
            </div>
          </template>

          <template v-else-if="activeTab !== 'skills'">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">描述 (Description)</label>
              <input v-model="formData.description" type="text" class="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-100 outline-none" />
            </div>
          </template>

          <template v-if="activeTab === 'knowledge_bases' && !isEditing">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2 mt-2">库类型 (Type)</label>
              <div class="flex gap-6 mb-4">
                <label class="flex items-center gap-2 cursor-pointer">
                  <input type="radio" v-model="formData.kb_type" value="local" class="text-blue-600 focus:ring-blue-500 w-4 h-4">
                  <span class="text-sm font-medium text-gray-800">本地知识库 (Local RAG)</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                  <input type="radio" v-model="formData.kb_type" value="remote" class="text-blue-600 focus:ring-blue-500 w-4 h-4">
                  <span class="text-sm font-medium text-gray-800">第三方远程接口 (Remote API)</span>
                </label>
              </div>
            </div>
          </template>

          <template v-if="activeTab === 'skills'">
            <div v-if="isEditing" class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">技能描述</label>
                <div class="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
                  {{ formData.description || '无' }}
                </div>
              </div>
              
              <!-- 如果有 files，显示双栏结构 -->
              <div v-if="formData.files && formData.files.length > 0" class="flex gap-4 h-[60vh] border border-gray-200 rounded-xl overflow-hidden bg-white shadow-inner">
                <!-- 左侧文件树 -->
                <div class="w-1/3 min-w-[200px] max-w-[250px] border-r border-gray-200 bg-gray-50 overflow-y-auto py-2">
                  <div class="px-3 pb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">包文件树 (Files)</div>
                  <ul class="space-y-0.5">
                    <li v-for="node in skillFileTree" :key="node.path">
                      <button v-if="node.isFile" @click="selectedSkillFile = node.file" 
                              class="w-full text-left py-1.5 pr-3 text-xs flex items-center gap-2 hover:bg-gray-200 transition"
                              :style="{ paddingLeft: `${node.depth * 12 + 12}px` }"
                              :class="selectedSkillFile?.path === node.path ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-700'">
                        <FileCode2 v-if="node.name.endsWith('.py') || node.name.endsWith('.js') || node.name.endsWith('.sh')" :size="14" class="opacity-70 shrink-0" />
                        <BookOpen v-else-if="node.name.endsWith('.md')" :size="14" class="opacity-70 shrink-0" />
                        <FileText v-else :size="14" class="opacity-70 shrink-0" />
                        <span class="truncate">{{ node.name }}</span>
                      </button>
                      <button v-else @click="toggleFolder(node.path)"
                              class="w-full text-left py-1.5 pr-3 text-xs flex items-center gap-2 text-gray-800 font-medium hover:bg-gray-200 transition"
                              :style="{ paddingLeft: `${node.depth * 12 + 12}px` }">
                        <FolderOpen v-if="expandedPaths.has(node.path)" :size="14" class="text-yellow-500 shrink-0" />
                        <Folder v-else :size="14" class="text-yellow-500 shrink-0" />
                        <span class="truncate">{{ node.name }}</span>
                      </button>
                    </li>
                  </ul>
                </div>
                <!-- 右侧内容渲染区 -->
                <div class="flex-1 overflow-y-auto p-5">
                  <div class="text-sm font-medium text-gray-800 mb-3 pb-2 border-b border-gray-100 flex items-center gap-2">
                     <span class="font-mono">{{ selectedSkillFile?.path }}</span>
                  </div>
                  <div v-if="selectedSkillFile?.path.toLowerCase().endsWith('.md')" class="markdown-body text-sm" v-html="renderMarkdown(selectedSkillFile.content)"></div>
                  <pre v-else class="text-xs font-mono bg-gray-50 p-4 rounded-lg overflow-x-auto text-gray-800">{{ selectedSkillFile?.content }}</pre>
                </div>
              </div>

              <!-- 单栏旧数据回退显示 -->
              <div v-else>
                <label class="block text-sm font-medium text-gray-700 mb-2">技能内容 (预览)</label>
                <div class="w-full p-5 border border-gray-200 rounded-xl bg-white overflow-y-auto max-h-[60vh] markdown-body text-sm shadow-inner" v-html="renderMarkdown(formData.content)"></div>
              </div>
            </div>
            <div v-else>
              <div class="mb-4 p-4 bg-orange-50 border border-orange-100 rounded-xl">
                <label class="block text-sm font-semibold text-orange-800 mb-2 flex items-center gap-1.5">
                  <Sparkles class="w-4 h-4 text-orange-600" /> AI 一句话生成技能
                </label>
                <div class="flex gap-2">
                  <input v-model="skillPrompt" type="text" placeholder="例如：生成一个用于代码评审（Code Review）的技能" class="flex-1 p-2.5 border border-orange-200 rounded-lg focus:ring-2 focus:ring-orange-400 outline-none text-sm bg-white" @keyup.enter="generateSkill" />
                  <button @click="generateSkill" :disabled="isGeneratingSkill" class="px-5 py-2.5 bg-orange-600 text-white text-sm font-medium rounded-lg shadow-sm hover:bg-orange-700 transition disabled:opacity-50 flex items-center justify-center min-w-[80px]">
                    <span v-if="isGeneratingSkill" class="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span>
                    {{ isGeneratingSkill ? '生成中...' : '生成' }}
                  </button>
                </div>
                <p class="text-xs text-orange-600/80 mt-2">提示：由配置的全局默认大模型驱动，生成后将直接保存到本地技能库。</p>
              </div>

              <div class="p-4 bg-gray-50 border border-gray-100 rounded-xl mb-4">
                <h4 class="text-sm font-semibold text-gray-800 mb-1">导入外部预设技能</h4>
                <p class="text-xs text-gray-600 leading-relaxed">
                  本平台作为技能调度中心，不支持直接手动编辑技能逻辑。请通过以下方式导入技能包 (必须包含 SKILL.md)。
                </p>
              </div>
            
            <div class="flex gap-6 mb-5">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="radio" v-model="skillImportType" value="local" name="import_type" class="text-orange-600 focus:ring-orange-500 w-4 h-4">
                <span class="text-sm font-medium text-gray-800">离线技能包上传</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="radio" v-model="skillImportType" value="gitlab" name="import_type" class="text-orange-600 focus:ring-orange-500 w-4 h-4">
                <span class="text-sm font-medium text-gray-800">GitLab 仓库拉取</span>
              </label>
            </div>

            <!-- Local Upload -->
            <div v-if="skillImportType === 'local'" class="space-y-4">
              <div class="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:bg-orange-50 hover:border-orange-200 transition cursor-pointer" @click="triggerFileInput">
                <input type="file" ref="skillFileInput" class="hidden" accept=".zip,.md" @change="handleFileSelected" />
                <div v-if="selectedFile" class="text-sm font-medium text-orange-600 flex flex-col items-center gap-2">
                  <div class="p-3 bg-orange-100 rounded-full inline-block"><Boxes :size="24" /></div>
                  已选择文件: {{ selectedFile.name }}
                </div>
                <div v-else class="flex flex-col items-center gap-2">
                  <div class="p-3 bg-gray-100 text-gray-400 rounded-full inline-block"><Plus :size="24" /></div>
                  <p class="text-sm font-medium text-gray-700">点击上传离线技能包文件</p>
                  <p class="text-xs text-gray-400 mt-1">支持包含 SKILL.md 的 .zip 压缩包或单独的 .md 文件</p>
                </div>
              </div>
            </div>

            <!-- GitLab Pull -->
            <div v-if="skillImportType === 'gitlab'" class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">GitLab 仓库地址 (Repository URL)</label>
                <input v-model="gitConfig.repo_url" type="text" placeholder="https://gitlab.com/username/repo.git" class="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-100 focus:border-orange-400 outline-none font-mono text-sm" />
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">分支 (Branch)</label>
                  <input v-model="gitConfig.branch" type="text" placeholder="例如: main (选填)" class="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-100 outline-none font-mono text-sm" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Access Token</label>
                  <input v-model="gitConfig.token" type="password" placeholder="私有仓库必需" class="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-100 outline-none font-mono text-sm" />
                </div>
              </div>
            </div>
            </div>
          </template>

          <template v-if="activeTab === 'mcp_servers'">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">连接协议 (Transport)</label>
              <select v-model="formData.connection_type" class="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-100 outline-none bg-white">
                <option value="stdio">Stdio (本地命令行启动)</option>
                <option value="sse">SSE (远程 HTTP 连接)</option>
              </select>
            </div>

            <template v-if="formData.connection_type === 'stdio'">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">启动命令 (Command)</label>
                <input v-model="formData.command" type="text" placeholder="例如: npx" class="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-100 outline-none font-mono text-sm" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">启动参数 (Args, 逗号分隔)</label>
                <input v-model="formData.args" type="text" placeholder="例如: -y,@modelcontextprotocol/server-postgres" class="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-100 outline-none font-mono text-sm" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">环境变量 (Environment Variables JSON)</label>
                <textarea v-model="formData.env" rows="3" placeholder='{"POSTGRES_URL": "postgresql://..."}' class="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-100 outline-none font-mono text-xs"></textarea>
              </div>
            </template>

            <template v-if="formData.connection_type === 'sse'">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">SSE 服务地址 (URL)</label>
                <input v-model="formData.url" type="text" placeholder="例如: http://localhost:3000/sse" class="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-100 outline-none font-mono text-sm" />
              </div>
            </template>
          </template>

          <template v-if="activeTab === 'tools'">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">参数定义 (Parameters JSON Schema)</label>
              <textarea v-model="formData.parameters" rows="4" placeholder='{"type": "object", "properties": {"target": {"type":"string"}}}' class="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-100 outline-none font-mono text-xs"></textarea>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">执行逻辑代码 (Node.js Sandbox)</label>
              <textarea v-model="formData.code" rows="6" placeholder='const { target } = args;\\nreturn "Executed " + target;' class="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-100 outline-none font-mono text-xs bg-gray-50"></textarea>
            </div>
            <div class="mt-4 pt-4 border-t border-gray-100">
              <label class="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">调试区</label>
              <label class="block text-sm font-medium text-gray-700 mb-1">模拟入参 (JSON)</label>
              <div class="flex gap-2">
                <input v-model="toolsTestArgs" type="text" placeholder='{"target": "world"}' class="flex-1 p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-100 outline-none font-mono text-xs" />
              </div>
              <div v-if="toolsTestResultOutput" class="mt-3">
                <label class="block text-sm font-medium text-gray-700 mb-1">执行结果</label>
                <div class="p-3 bg-gray-900 text-green-400 font-mono text-xs rounded-lg overflow-y-auto max-h-[300px] whitespace-pre-wrap leading-relaxed shadow-inner border border-gray-800">
                  {{ toolsTestResultOutput }}
                </div>
              </div>
            </div>
          </template>



        </div>
        <div class="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 items-center">
          
          <div class="mr-auto">
            <button v-if="activeTab === 'models'" type="button" @click="testModel" class="px-4 py-2 text-sm text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition font-medium flex items-center" :disabled="isTesting">
              <span v-if="isTesting" class="inline-block w-3 h-3 border-2 border-purple-600 border-t-transparent rounded-full animate-spin mr-2"></span>
              {{ isTesting ? '正在测试...' : '测试连接' }}
            </button>
            <button v-if="activeTab === 'mcp_servers'" type="button" @click="testMcp" class="px-4 py-2 text-sm text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition font-medium flex items-center" :disabled="isTestingMcp">
              <span v-if="isTestingMcp" class="inline-block w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mr-2"></span>
              {{ isTestingMcp ? '探测中...' : '测试 MCP 握手' }}
            </button>
            <button v-if="activeTab === 'tools'" type="button" @click="testTools" class="px-4 py-2 text-sm text-green-600 bg-green-50 hover:bg-green-100 rounded-lg transition font-medium flex items-center" :disabled="isTestingTools">
              <span v-if="isTestingTools" class="inline-block w-3 h-3 border-2 border-green-600 border-t-transparent rounded-full animate-spin mr-2"></span>
              {{ isTestingTools ? '执行中...' : '运行沙箱' }}
            </button>

            <button v-if="activeTab === 'skills' && !isEditing" type="button" @click="importSkill" class="px-4 py-2 text-sm text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-lg transition font-medium flex items-center" :disabled="isImportingSkill">
              <span v-if="isImportingSkill" class="inline-block w-3 h-3 border-2 border-orange-600 border-t-transparent rounded-full animate-spin mr-2"></span>
              {{ isImportingSkill ? (skillImportType === 'local' ? '上传中...' : '拉取中...') : (skillImportType === 'local' ? '开始上传' : '开始拉取') }}
            </button>
          </div>

          <button @click="showModal = false" class="px-4 py-2 text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition">取消</button>
          <button v-if="activeTab !== 'skills'" @click="saveModal" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-sm">保存并生效</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Markdown Styles */
:deep(.markdown-body) {
  line-height: 1.6;
  color: #334155;
}
:deep(.markdown-body p) {
  margin-bottom: 0.75em;
}
:deep(.markdown-body p:last-child) {
  margin-bottom: 0;
}
:deep(.markdown-body pre) {
  background-color: #f8fafc;
  padding: 1em;
  border-radius: 0.5rem;
  border: 1px solid #e2e8f0;
  overflow-x: auto;
  margin: 1em 0;
}
:deep(.markdown-body code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.85em;
  background-color: #f1f5f9;
  padding: 0.2em 0.4em;
  border-radius: 4px;
}
:deep(.markdown-body pre code) {
  background-color: transparent;
  padding: 0;
}
:deep(.markdown-body ul) {
  list-style-type: disc;
  padding-left: 1.5em;
  margin-bottom: 0.75em;
}
:deep(.markdown-body ol) {
  list-style-type: decimal;
  padding-left: 1.5em;
  margin-bottom: 0.75em;
}
:deep(.markdown-body h1), :deep(.markdown-body h2), :deep(.markdown-body h3) {
  font-weight: 700;
  margin-top: 1.5em;
  margin-bottom: 0.5em;
  color: #0f172a;
}
:deep(.markdown-body h1) { font-size: 1.5em; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.3em; }
:deep(.markdown-body h2) { font-size: 1.25em; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.3em; }
:deep(.markdown-body h3) { font-size: 1.1em; }
:deep(.markdown-body a) {
  color: #2563eb;
  text-decoration: none;
}
:deep(.markdown-body a:hover) {
  text-decoration: underline;
}
:deep(.markdown-body blockquote) {
  border-left: 4px solid #cbd5e1;
  padding-left: 1em;
  color: #64748b;
  margin: 1em 0;
}
:deep(.markdown-body table) {
  width: 100%;
  border-collapse: collapse;
  margin: 1em 0;
}
:deep(.markdown-body th), :deep(.markdown-body td) {
  border: 1px solid #e2e8f0;
  padding: 0.5em 0.75em;
  text-align: left;
}
:deep(.markdown-body th) {
  background-color: #f8fafc;
  font-weight: 600;
}
</style>
