<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import request from '../utils/request'
import { Message } from '../utils/message'
import { ChevronLeft, Save, Bot, Settings2, Database, Puzzle, Zap, MessageSquare, Send, Sparkles, Wand2, Wrench, Check, X, Trash2, Paperclip, Loader2, Clock, Activity, FileText, DownloadCloud } from 'lucide-vue-next'
import { marked } from 'marked'

const route = useRoute()
const router = useRouter()
const agentId = route.params.id

const isSaving = ref(false)
const modelsList = ref<any[]>([])

const agent = ref<any>({
  name: '',
  description: '',
  model_name: 'gpt-4o',
  llm_config: { temperature: 0.7, top_p: 1.0, max_tokens: 16384, rounds: 10, max_loops: 10 },
  system_prompt: '',
  memory_enabled: 1,
  enable_video: 1,
  enable_voice: 1,
  cron_enabled: 0,
  cron_config: { type: 'interval', value: 5, unit: 'minutes', time: '08:00', expression: '*/5 * * * *', prompt: '系统定时触发任务' },
  tools: [] as string[],
  mcp_servers: [] as string[],
  plugins: [] as string[],
  knowledge_bases: [] as string[],
  skills: [] as any[],
  sub_agents: [] as string[]
})

const fetchAgent = async () => {
  try {
    const [agentRes, modelsRes] = await Promise.all([
      request.get(`/api/agents/${agentId}`),
      request.get('/api/models')
    ])
    modelsList.value = modelsRes.data

    // Merge data safely
    Object.assign(agent.value, agentRes.data)
    if (!agent.value.llm_config) {
      agent.value.llm_config = { temperature: 0.7, top_p: 1.0, max_tokens: 16384, rounds: 10, max_loops: 10 }
    }
    if (agent.value.enable_video === undefined) agent.value.enable_video = 1
    if (agent.value.enable_voice === undefined) agent.value.enable_voice = 1
    if (!agent.value.cron_config) {
      agent.value.cron_config = { type: 'interval', value: 5, unit: 'minutes', time: '08:00', expression: '*/5 * * * *', prompt: '系统定时触发任务' }
    } else if (!agent.value.cron_config.prompt) {
      agent.value.cron_config.prompt = '系统定时触发任务'
    }
  } catch (error) {
    Message.error('加载数据失败')
    router.push('/console/agents')
  }
}

const showAdvanced = ref(false)

const saveAgent = async () => {
  isSaving.value = true
  try {
    await request.put(`/api/agents/${agentId}`, agent.value)
    Message.success('已自动保存')
  } catch (error) {
    Message.error('保存失败')
  } finally {
    isSaving.value = false
  }
}

const isClearing = ref(false)
const clearMemory = async () => {
  if (!confirm('确定要彻底清除该智能体的所有长短期记忆、会话上下文和沙盒数据吗？此操作不可逆！')) return
  isClearing.value = true
  try {
    await request.delete(`/api/agents/${agentId}/memory`)
    chatMessages.value = []
    Message.success('记忆与沙盒数据已完全清除')
  } catch (error) {
    Message.error('清除失败')
  } finally {
    isClearing.value = false
  }
}

// 简单的防抖保存
let saveTimeout: any
watch(agent, () => {
  clearTimeout(saveTimeout)
  saveTimeout = setTimeout(saveAgent, 1500)
}, { deep: true })

const loadHistory = async () => {
  try {
    const res = await request.get(`/api/agents/${agentId}/history`)
    if (res.data && res.data.length > 0) {
      // 兼容旧格式（只有 content 字段）转换为 segments 格式
      chatMessages.value = res.data.map((msg: any) => {
        if (msg.segments) return msg
        return { role: msg.role, segments: [{ type: 'text', content: msg.content || '' }] }
      })
    }
  } catch (err) {
    console.error('Failed to load history', err)
  }
}

onMounted(() => {
  fetchAgent()
  loadHistory()
})

// Debug Chat State
// 每条消息结构: { role, segments: [{type: 'text'|'tool'|'artifact', ...}] }
// 为了兼容保存的历史记录(只有 content 字段)，保留 content 字段，渲染时优先用 segments
const chatMessages = ref<any[]>([
  { role: 'assistant', segments: [{ type: 'text', content: '您好！我是您的智能体，可以通过右侧面板调整我的提示词和模型配置，在这里对我进行测试。' }] }
])
const chatInput = ref('')
const isChatting = ref(false)

const fileInput = ref<HTMLInputElement | null>(null)
const uploadedFiles = ref<any[]>([])
const isUploading = ref(false)

const triggerUpload = () => {
  if (fileInput.value) fileInput.value.click()
}

const onFileChange = async (e: Event) => {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  
  isUploading.value = true
  const formData = new FormData()
  formData.append('file', file)
  formData.append('filename', file.name)
  
  try {
    const res = await request.post(`/api/agents/${agentId}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    if (res.data.success) {
      uploadedFiles.value.push(res.data)
    } else {
      Message.error('上传失败')
    }
  } catch(err: any) {
    Message.error('上传异常: ' + err.message)
  } finally {
    isUploading.value = false
    if (target) target.value = ''
  }
}

const removeUploadedFile = (index: number) => {
  uploadedFiles.value.splice(index, 1)
}

// 辅助函数：获取消息的纯文本内容（展示用）
const getMessageContent = (msg: any): string => {
  if (msg.segments) {
    return msg.segments.filter((s: any) => s.type === 'text').map((s: any) => s.content).join('')
  }
  return msg.content || ''
}

// 辅助函数：将消息构造为多模态内容（LangChain 格式）
const getMultiModalContent = (msg: any): any => {
  if (!msg.segments) return msg.content || ''
  
  const plainTexts = msg.segments.filter((s: any) => s.type === 'text').map((s: any) => s.content).join('')
  const fileTexts = msg.segments.filter((s: any) => s.type === 'file_text').map((s: any) => `\n\n[用户上传了附件: ${s.file_name}]\n${s.content}`).join('')
  const texts = plainTexts + fileTexts

  const images = msg.segments.filter((s: any) => s.type === 'image').map((s: any) => ({
    type: 'image_url',
    image_url: { url: s.base64 }
  }))
  
  if (images.length === 0) return texts;
  return [
    { type: 'text', text: texts },
    ...images
  ]
}

const showSkillModal = ref(false)
const availableSkills = ref<any[]>([])

const openSkillModal = async () => {
  try {
    const res = await request.get('/api/skills')
    availableSkills.value = res.data || []
    showSkillModal.value = true
  } catch (error) {
    Message.error('无法加载技能列表')
  }
}

const toggleSkill = (skill: any) => {
  if (!agent.value.skills) agent.value.skills = []
  const index = agent.value.skills.findIndex((s: any) => s.id === skill.id)
  if (index >= 0) {
    agent.value.skills.splice(index, 1)
  } else {
    agent.value.skills.push({ id: skill.id, name: skill.name, description: skill.description })
  }
}

const isSkillSelected = (skill: any) => {
  return agent.value.skills?.some((s: any) => s.id === skill.id)
}

const showMcpModal = ref(false)
const availableMcpServers = ref<any[]>([])

const openMcpModal = async () => {
  try {
    const res = await request.get('/api/mcp_servers')
    availableMcpServers.value = res.data || []
    showMcpModal.value = true
  } catch (error) {
    Message.error('无法加载 MCP 服务器列表')
  }
}

const toggleMcpServer = (mcp: any) => {
  if (!agent.value.mcp_servers || !Array.isArray(agent.value.mcp_servers)) {
    agent.value.mcp_servers = []
  }
  const index = agent.value.mcp_servers.indexOf(mcp.id)
  if (index >= 0) {
    agent.value.mcp_servers.splice(index, 1)
  } else {
    agent.value.mcp_servers.push(mcp.id)
  }
}

const isMcpServerSelected = (mcp: any) => {
  if (!agent.value.mcp_servers || !Array.isArray(agent.value.mcp_servers)) return false
  return agent.value.mcp_servers.includes(mcp.id)
}

const getMcpServerCount = () => {
  if (!agent.value.mcp_servers || !Array.isArray(agent.value.mcp_servers)) return 0
  return agent.value.mcp_servers.length
}

const showKbModal = ref(false)
const availableKnowledgeBases = ref<any[]>([])

const openKbModal = async () => {
  try {
    const res = await request.get('/api/knowledge_bases')
    availableKnowledgeBases.value = res.data || []
    showKbModal.value = true
  } catch (error) {
    Message.error('无法加载知识库列表')
  }
}

const toggleKb = (kb: any) => {
  if (!agent.value.knowledge_bases || !Array.isArray(agent.value.knowledge_bases)) {
    agent.value.knowledge_bases = []
  }
  const index = agent.value.knowledge_bases.indexOf(kb.id)
  if (index >= 0) {
    agent.value.knowledge_bases.splice(index, 1)
  } else {
    agent.value.knowledge_bases.push(kb.id)
  }
}

const isKbSelected = (kb: any) => {
  if (!agent.value.knowledge_bases || !Array.isArray(agent.value.knowledge_bases)) return false
  return agent.value.knowledge_bases.includes(kb.id)
}

const getKbCount = () => {
  if (!agent.value.knowledge_bases || !Array.isArray(agent.value.knowledge_bases)) return 0
  return agent.value.knowledge_bases.length
}

const showToolModal = ref(false)
const availableTools = ref<any[]>([])

const openToolModal = async () => {
  try {
    const res = await request.get('/api/tools')
    availableTools.value = res.data || []
    showToolModal.value = true
  } catch (error) {
    Message.error('无法加载工具列表')
  }
}

const toggleTool = (tool: any) => {
  if (!agent.value.tools || !Array.isArray(agent.value.tools)) {
    agent.value.tools = []
  }
  const index = agent.value.tools.indexOf(tool.id)
  if (index >= 0) {
    agent.value.tools.splice(index, 1)
  } else {
    agent.value.tools.push(tool.id)
  }
}

const isToolSelected = (tool: any) => {
  if (!agent.value.tools || !Array.isArray(agent.value.tools)) return false
  return agent.value.tools.includes(tool.id)
}

const getToolCount = () => {
  if (!agent.value.tools || !Array.isArray(agent.value.tools)) return 0
  return agent.value.tools.length
}

const showSubAgentModal = ref(false)
const availableSubAgents = ref<any[]>([])

const openSubAgentModal = async () => {
  try {
    const res = await request.get('/api/agents')
    availableSubAgents.value = (res.data || []).filter((a: any) => a.id.toString() !== agentId.toString())
    showSubAgentModal.value = true
  } catch (error) {
    Message.error('无法加载智能体列表')
  }
}

const toggleSubAgent = (sub: any) => {
  if (!agent.value.sub_agents || !Array.isArray(agent.value.sub_agents)) {
    agent.value.sub_agents = []
  }
  const index = agent.value.sub_agents.indexOf(sub.id)
  if (index >= 0) {
    agent.value.sub_agents.splice(index, 1)
  } else {
    agent.value.sub_agents.push(sub.id)
  }
}

const isSubAgentSelected = (sub: any) => {
  if (!agent.value.sub_agents || !Array.isArray(agent.value.sub_agents)) return false
  return agent.value.sub_agents.includes(sub.id)
}

const getSubAgentCount = () => {
  if (!agent.value.sub_agents || !Array.isArray(agent.value.sub_agents)) return 0
  return agent.value.sub_agents.length
}

// Run Logs Logic
const showRunLogsModal = ref(false)
const isLoadingLogs = ref(false)
const runLogs = ref<any[]>([])

const openRunLogs = async () => {
  showRunLogsModal.value = true
  await fetchRunLogs()
}

const fetchRunLogs = async () => {
  if (!agent.value.id) return
  isLoadingLogs.value = true
  try {
    const res = await request.get(`/api/agents/${agent.value.id}/runs`)
    runLogs.value = res.data || []
  } catch (error) {
    Message.error('无法加载运行记录')
  } finally {
    isLoadingLogs.value = false
  }
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
  if (!agent.value.id) return
  try {
    await request.delete(`/api/agents/${agent.value.id}/runs`)
    Message.success('运行记录已清空')
    runLogs.value = []
  } catch (error) {
    Message.error('清空失败')
  }
}



const renderMarkdown = (text: string) => {
  if (!text) return ''
  return marked.parse(text)
}

// 展示工具调用参数：尝试将 JSON 内部的 \n \t 转换为可读形式
const formatToolArgs = (args: string) => {
  if (!args) return ''
  try {
    const parsed = JSON.parse(args)
    // 对每个字段进行可读化处理
    const display: Record<string, any> = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string') {
        // 将 JSON 转义的 \n \t \" 还原为真实字符
        display[k] = v.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"')
      } else {
        display[k] = v
      }
    }
    return JSON.stringify(display, null, 2)
  } catch {
    return args
  }
}

// 判断消息是否以工具调用结尾（无后续文字）
const endsWithToolCall = (msg: any) => {
  const segs = msg.segments
  if (!segs || segs.length === 0) return false
  const last = segs[segs.length - 1]
  return last.type === 'tool' && last.done
}

let chatAbortController: AbortController | null = null

const stopChat = () => {
  if (chatAbortController) {
    chatAbortController.abort()
    chatAbortController = null
  }
}

const sendMessage = async () => {
  if ((!chatInput.value.trim() && uploadedFiles.value.length === 0) || isChatting.value) return
  
  const userText = chatInput.value
  chatInput.value = ''
  
  const userSegments: any[] = [{ type: 'text', content: userText }]
  for (const file of uploadedFiles.value) {
    if (file.type === 'image') {
      userSegments.push({ type: 'image', base64: file.base64, file_name: file.file_name })
    } else {
      userSegments.push({ type: 'file_text', content: file.content, file_name: file.file_name })
    }
  }
  uploadedFiles.value = []
  
  chatMessages.value.push({ role: 'user', segments: userSegments })
  
  const assistantMessageIndex = chatMessages.value.length
  chatMessages.value.push({ role: 'assistant', segments: [] })
  isChatting.value = true

  // 辅助函数：获取最后一个文字段或新建一个
  const getOrCreateTextSegment = () => {
    const segs = chatMessages.value[assistantMessageIndex].segments
    if (segs.length > 0 && segs[segs.length - 1].type === 'text') {
      return segs[segs.length - 1]
    }
    const seg = { type: 'text', content: '' }
    segs.push(seg)
    return seg
  }
  
  try {
    // 发送历史记录时支持多模态内容（LangChain 兼容）
    const historyForSend = chatMessages.value.slice(0, -1).map((msg: any) => ({
      role: msg.role,
      content: getMultiModalContent(msg)
    }))

    chatAbortController = new AbortController()
    const response = await fetch(`/api/agents/${agentId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: historyForSend }),
      signal: chatAbortController.signal
    })

    if (!response.body) throw new Error('No response body')
    
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      buffer += decoder.decode(value, { stream: true })
      
      const lines = buffer.split('\n\n')
      buffer = lines.pop() || '' 
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6)
          try {
            const data = JSON.parse(dataStr)
            const segs = chatMessages.value[assistantMessageIndex].segments
            
            if (data.type === 'TEXT_MESSAGE_CONTENT') {
              getOrCreateTextSegment().content += data.delta
            } else if (data.type === 'RUN_ERROR') {
              getOrCreateTextSegment().content += `\n[执行错误: ${data.error}]`
            } else if (data.type === 'TOOL_CALL_START') {
              // 新建一个工具调用段
              segs.push({ type: 'tool', tool_name: data.tool_name, args: '', done: false })
            } else if (data.type === 'TOOL_CALL_CHUNK') {
              // 追加到最后一个工具调用段
              const toolSeg = [...segs].reverse().find((s: any) => s.type === 'tool')
              if (toolSeg) toolSeg.args += data.delta
            } else if (data.type === 'TOOL_CALL_END') {
              const toolSeg = [...segs].reverse().find((s: any) => s.type === 'tool')
              if (toolSeg) {
                // 解析 JSON args，截断过长的 content 字段，格式化显示
                try {
                  const parsed = JSON.parse(toolSeg.args)
                  if (parsed.content && typeof parsed.content === 'string' && parsed.content.length > 200) {
                    parsed.content = parsed.content.slice(0, 200) + `\n... [内容共 ${parsed.content.length} 字符，已截断]`
                  }
                  toolSeg.args = JSON.stringify(parsed, null, 2)
                } catch {
                  // 非 JSON 格式保持原样
                }
                toolSeg.done = true
              }
            } else if (data.type === 'TOOL_CALL_RESULT') {
              const toolSeg = [...segs].reverse().find((s: any) => s.type === 'tool' && s.tool_name === data.tool_name)
              if (toolSeg) {
                toolSeg.result = data.result
              }
            } else if (data.type === 'FILE_ARTIFACT') {
              const encodedPath = data.file_path.split('/').map((seg: string) => encodeURIComponent(seg)).join('/');
              segs.push({
                type: 'artifact',
                file_name: data.file_name,
                file_path: data.file_path,
                file_url: `http://localhost:8001${encodedPath}`
              })
            }
          } catch(e) {
            console.error('SSE JSON parsing error:', e, dataStr)
          }
        }
      }
    }
  } catch(error: any) {
    if (error.name === 'AbortError') {
      getOrCreateTextSegment().content += `\n\n[您已手动终止生成]`
    } else {
      getOrCreateTextSegment().content += `\n[网络异常: ${(error as any).message}]`
    }
  } finally {
    isChatting.value = false
    
    // 短期记忆修剪逻辑
    const rounds = agent.value.llm_config?.rounds || 10
    const maxMessages = rounds * 2
    if (chatMessages.value.length > maxMessages) {
      chatMessages.value = chatMessages.value.slice(-maxMessages)
    }
    
    // 异步保存短期记忆
    request.post(`/api/agents/${agentId}/history`, { messages: chatMessages.value })
      .catch((e: any) => console.error('Failed to save short term history:', e))
  }
}

const isGeneratingPrompt = ref(false)
const showPromptGenerator = ref(false)
const promptKeyword = ref('')

const openPromptGenerator = () => {
  if (!agent.value.name) {
    Message.error('请先在顶部填写智能体名称')
    return
  }
  const currentModel = modelsList.value.find(m => m.model_name === agent.value.model_name)
  if (!currentModel) {
    Message.error('请先在下方选择有效的模型')
    return
  }
  promptKeyword.value = ''
  showPromptGenerator.value = true
}

const confirmGeneratePrompt = async () => {
  const currentModel = modelsList.value.find(m => m.model_name === agent.value.model_name)
  if (!currentModel) return

  isGeneratingPrompt.value = true
  try {
    const res = await request.post('/api/generate/system-prompt', {
      name: agent.value.name,
      description: agent.value.description,
      keyword: promptKeyword.value,
      model_name: currentModel.model_name,
      api_key: currentModel.api_key,
      base_url: currentModel.base_url,
      advanced_config: currentModel.advanced_config
    }, { timeout: 60000 }) // 覆盖默认 10s 超时
    
    if (res.data && res.data.success) {
      agent.value.system_prompt = res.data.prompt
      Message.success('已自动生成 System Prompt')
      showPromptGenerator.value = false
    } else {
      Message.error('生成失败: ' + (res.data?.error || '未知错误'))
    }
  } catch (err: any) {
    Message.error('网络或服务异常: ' + err.message)
  } finally {
    isGeneratingPrompt.value = false
  }
}
</script>

<template>
  <div class="h-screen w-screen flex flex-col bg-gray-50 fixed inset-0 z-[100]">
    <div class="h-8 w-full bg-white shrink-0" style="-webkit-app-region: drag"></div>
    <!-- Header -->
    <header class="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 shrink-0 shadow-sm z-10" style="-webkit-app-region: drag">
      <div class="flex items-center gap-4" style="-webkit-app-region: no-drag">
        <button @click="router.push('/console/agents')" class="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition">
          <ChevronLeft :size="20" />
        </button>
        <div class="h-5 w-px bg-gray-300"></div>
        <div class="flex items-center gap-2">
          <input v-model="agent.name" class="font-bold text-gray-800 text-lg bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-blue-100 rounded px-1 w-64" placeholder="智能体名称" />
        </div>
      </div>
      <div class="flex items-center gap-3" style="-webkit-app-region: no-drag">
        <div class="text-xs text-gray-400 flex items-center gap-1">
          <div class="w-2 h-2 rounded-full" :class="isSaving ? 'bg-orange-400 animate-pulse' : 'bg-green-400'"></div>
          {{ isSaving ? '保存中...' : '已自动保存' }}
        </div>
        <button @click="router.push(`/run/${agentId}`)" class="flex items-center gap-2 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition-colors shadow-sm ml-2 font-medium">
          <Zap class="w-4 h-4" /> 运行模式
        </button>
      </div>
    </header>

    <!-- Main Content: 2 Columns -->
    <div class="flex flex-1 overflow-hidden">
      
      <!-- Left Column: Configuration -->
      <div class="w-[55%] flex flex-col bg-white border-r border-gray-200 overflow-y-auto">
        <div class="p-6 max-w-3xl mx-auto w-full space-y-8">
          
          <!-- 角色与人设 -->
          <section>
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-2">
                <Bot class="text-blue-600" :size="20" />
                <h2 class="text-lg font-bold text-gray-900">角色与设定 (System Prompt)</h2>
              </div>
              <button @click="openPromptGenerator" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition disabled:opacity-50">
                <Wand2 :size="14" />
                AI 自动生成
              </button>
            </div>
            <p class="text-sm text-gray-500 mb-3">详细描述该智能体的目标、工作流程、限制条件和输出格式。</p>
            <textarea 
              v-model="agent.system_prompt" 
              class="w-full h-40 p-4 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition text-sm leading-relaxed resize-y"
              placeholder="例如：你是一个高级数据分析师。你的目标是... 你的语气应该是专业的... 每次回答前请先搜索知识库..."
            ></textarea>
          </section>

          <!-- 模型设置 -->
          <section>
            <div class="flex items-center gap-2 mb-3">
              <Settings2 class="text-purple-600" :size="20" />
              <h2 class="text-lg font-bold text-gray-900">模型设置 (Model)</h2>
            </div>
            <div class="bg-white border border-gray-200 rounded-xl p-5 space-y-5 shadow-sm">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1.5">模型选择</label>
                <select v-model="agent.model_name" class="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-100 outline-none">
                  <option v-for="m in modelsList" :key="m.id" :value="m.model_name">{{ m.name }} ({{ m.model_name }})</option>
                </select>
              </div>
              
              <div class="grid grid-cols-2 gap-6">
                <div>
                  <div class="flex justify-between mb-1">
                    <label class="text-sm font-medium text-gray-700">Temperature</label>
                    <span class="text-xs text-gray-500">{{ agent.llm_config.temperature }}</span>
                  </div>
                  <input type="range" v-model.number="agent.llm_config.temperature" min="0" max="2" step="0.1" class="w-full accent-purple-600">
                  <p class="text-xs text-gray-400 mt-1">值越大回复越随机和具创造性</p>
                </div>
                <div>
                  <div class="flex justify-between mb-1">
                    <label class="text-sm font-medium text-gray-700">Top P</label>
                    <span class="text-xs text-gray-500">{{ agent.llm_config.top_p }}</span>
                  </div>
                  <input type="range" v-model.number="agent.llm_config.top_p" min="0" max="1" step="0.05" class="w-full accent-purple-600">
                </div>
              </div>
              
              <div class="grid grid-cols-2 gap-6">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">记忆轮次 (Rounds)</label>
                  <input type="number" v-model.number="agent.llm_config.rounds" class="w-full p-2 border border-gray-200 rounded-lg bg-gray-50" min="0" max="100">
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">长期记忆 (Long-term Memory)</label>
                  <label class="flex items-center cursor-pointer mt-2">
                    <div class="relative">
                      <input type="checkbox" v-model="agent.memory_enabled" :true-value="1" :false-value="0" class="sr-only">
                      <div class="block w-10 h-6 rounded-full transition" :class="agent.memory_enabled ? 'bg-green-500' : 'bg-gray-300'"></div>
                      <div class="dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition" :class="agent.memory_enabled ? 'transform translate-x-4' : ''"></div>
                    </div>
                    <div class="ml-3 text-sm text-gray-600">{{ agent.memory_enabled ? '已开启' : '已关闭' }}</div>
                  </label>
                </div>
              </div>
              
              <div class="grid grid-cols-2 gap-6 mt-6">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">启用交互录像 (Video Record)</label>
                  <label class="flex items-center cursor-pointer mt-2">
                    <div class="relative">
                      <input type="checkbox" v-model="agent.enable_video" :true-value="1" :false-value="0" class="sr-only">
                      <div class="block w-10 h-6 rounded-full transition" :class="agent.enable_video ? 'bg-green-500' : 'bg-gray-300'"></div>
                      <div class="dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition" :class="agent.enable_video ? 'transform translate-x-4' : ''"></div>
                    </div>
                    <div class="ml-3 text-sm text-gray-600">{{ agent.enable_video ? '已开启' : '已关闭' }}</div>
                  </label>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">启用语音输入 (Voice UI)</label>
                  <label class="flex items-center cursor-pointer mt-2">
                    <div class="relative">
                      <input type="checkbox" v-model="agent.enable_voice" :true-value="1" :false-value="0" class="sr-only">
                      <div class="block w-10 h-6 rounded-full transition" :class="agent.enable_voice ? 'bg-green-500' : 'bg-gray-300'"></div>
                      <div class="dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition" :class="agent.enable_voice ? 'transform translate-x-4' : ''"></div>
                    </div>
                    <div class="ml-3 text-sm text-gray-600">{{ agent.enable_voice ? '已开启' : '已关闭' }}</div>
                  </label>
                </div>
              </div>

              <!-- 高级配置 -->
              <div class="pt-4 mt-6 border-t border-gray-100">
                <div class="flex items-center gap-1.5 mb-3 cursor-pointer select-none" @click="showAdvanced = !showAdvanced">
                  <svg :class="showAdvanced ? 'rotate-90' : ''" class="w-3.5 h-3.5 text-gray-400 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
                  <span class="text-xs font-medium text-gray-500">高级配置 (Advanced)</span>
                </div>
                <div v-if="showAdvanced" class="grid grid-cols-2 gap-6">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">工具调用轮次上限 (Max Loops)</label>
                    <input type="number" v-model.number="agent.llm_config.max_loops" class="w-full p-2 border border-gray-200 rounded-lg bg-gray-50 focus:ring-2 focus:ring-purple-100 outline-none" min="1" max="30">
                    <p class="text-xs text-gray-400 mt-1">ReAct 循环最大执行轮次，默认 10</p>
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">最大输出 Token (Max Tokens)</label>
                    <input type="number" v-model.number="agent.llm_config.max_tokens" class="w-full p-2 border border-gray-200 rounded-lg bg-gray-50 focus:ring-2 focus:ring-purple-100 outline-none" min="256" max="128000" step="1024">
                    <p class="text-xs text-gray-400 mt-1">单次生成的最大 token 数，默认 16384</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- 扩展能力 -->
          <section>
            <div class="flex items-center gap-2 mb-3">
              <Sparkles class="text-orange-500" :size="20" />
              <h2 class="text-lg font-bold text-gray-900">能力与扩展 (Capabilities)</h2>
            </div>
            
            <div class="space-y-3">
              <div @click="openToolModal" class="p-4 border border-gray-200 rounded-xl hover:border-blue-200 transition cursor-pointer flex justify-between items-center group">
                <div class="flex items-center gap-3">
                  <div class="p-2 bg-blue-50 text-blue-600 rounded-lg"><Puzzle :size="18" /></div>
                  <div>
                    <div class="font-medium text-gray-900">工具箱 (Tools / Plugins)</div>
                    <div class="text-xs text-gray-500">
                      {{ getToolCount() > 0 ? `已绑定 ${getToolCount()} 个工具` : '联网搜索、代码执行、外部 API...' }}
                    </div>
                  </div>
                </div>
                <div class="text-sm text-blue-600 font-medium opacity-0 group-hover:opacity-100 transition">配置工具箱 +</div>
              </div>
              
              <div @click="openKbModal" class="p-4 border border-gray-200 rounded-xl hover:border-teal-200 transition cursor-pointer flex justify-between items-center group">
                <div class="flex items-center gap-3">
                  <div class="p-2 bg-teal-50 text-teal-600 rounded-lg"><Database :size="18" /></div>
                  <div>
                    <div class="font-medium text-gray-900">知识库 (Knowledge Base)</div>
                    <div class="text-xs text-gray-500">
                      {{ getKbCount() > 0 ? `已绑定 ${getKbCount()} 个知识库` : '绑定本地文档或向量库 (RAG)' }}
                    </div>
                  </div>
                </div>
                <div class="text-sm text-teal-600 font-medium opacity-0 group-hover:opacity-100 transition">配置知识库 +</div>
              </div>

              <!-- 新增的 Subagents 面板 -->
              <div @click="openSubAgentModal" class="p-4 border border-gray-200 rounded-xl hover:border-indigo-200 transition cursor-pointer flex justify-between items-center group">
                <div class="flex items-center gap-3">
                  <div class="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><Bot :size="18" /></div>
                  <div>
                    <div class="font-medium text-gray-900">下属智能体 (Subagents)</div>
                    <div class="text-xs text-gray-500">
                      {{ getSubAgentCount() > 0 ? `已绑定 ${getSubAgentCount()} 个子智能体` : '将本智能体转化为多智能体中枢' }}
                    </div>
                  </div>
                </div>
                <div class="text-sm text-indigo-600 font-medium opacity-0 group-hover:opacity-100 transition">配置子智能体 +</div>
              </div>

              <div @click="openMcpModal" class="p-4 border border-gray-200 rounded-xl hover:border-indigo-200 transition cursor-pointer flex justify-between items-center group">
                <div class="flex items-center gap-3">
                  <div class="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><Zap :size="18" /></div>
                  <div>
                    <div class="font-medium text-gray-900">MCP 服务器 (Model Context Protocol)</div>
                    <div class="text-xs text-gray-500">
                      {{ getMcpServerCount() > 0 ? `已绑定 ${getMcpServerCount()} 个服务器` : '接入标准化外部系统上下文' }}
                    </div>
                  </div>
                </div>
                <div class="text-sm text-indigo-600 font-medium opacity-0 group-hover:opacity-100 transition">配置 MCP +</div>
              </div>

              <!-- 技能 (Skills) -->
              <div @click="openSkillModal" class="p-4 border border-gray-200 rounded-xl hover:border-orange-200 transition cursor-pointer flex justify-between items-center group">
                <div class="flex items-center gap-3">
                  <div class="p-2 bg-orange-50 text-orange-600 rounded-lg"><Wrench :size="18" /></div>
                  <div>
                    <div class="font-medium text-gray-900">技能 (Skills)</div>
                    <div class="text-xs text-gray-500">
                      {{ agent.skills && agent.skills.length > 0 ? `已绑定 ${agent.skills.length} 个技能` : '绑定离线脚本或自定义任务包' }}
                    </div>
                  </div>
                </div>
                <div class="text-sm text-orange-600 font-medium opacity-0 group-hover:opacity-100 transition">绑定技能 +</div>
              </div>
            </div>
          </section>

          <!-- 定时调度 -->
          <section class="mt-8">
            <div class="flex items-center gap-2 mb-3">
              <Clock class="text-pink-500" :size="20" />
              <h2 class="text-lg font-bold text-gray-900">定时调度 (Scheduled Dispatch)</h2>
            </div>
            
            <div class="p-4 border border-gray-200 rounded-xl bg-white">
              <div class="flex items-center justify-between mb-4">
                <div class="flex flex-col">
                  <span class="font-medium text-gray-900">启用定时触发</span>
                  <span class="text-xs text-gray-500">在后台定期自动唤醒该智能体执行系统默认任务</span>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" v-model="agent.cron_enabled" :true-value="1" :false-value="0" class="sr-only peer">
                  <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-pink-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                </label>
              </div>

              <div v-if="agent.cron_enabled === 1" class="space-y-4 pt-3 border-t border-gray-100">
                <div class="flex gap-4">
                  <div class="w-1/3">
                    <label class="block text-sm font-medium text-gray-700 mb-1">触发频率</label>
                    <select v-model="agent.cron_config.type" class="w-full p-2 border border-gray-200 rounded-lg bg-gray-50 focus:ring-2 focus:ring-pink-100 outline-none text-sm">
                      <option value="interval">固定间隔</option>
                      <option value="daily">每天固定时间</option>
                      <option value="cron">自定义 Cron</option>
                    </select>
                  </div>
                  
                  <div class="w-2/3 flex items-end gap-2" v-if="agent.cron_config.type === 'interval'">
                    <div class="flex-1">
                      <label class="block text-sm font-medium text-gray-700 mb-1">间隔数值</label>
                      <input type="number" v-model.number="agent.cron_config.value" min="1" class="w-full p-2 border border-gray-200 rounded-lg bg-gray-50 focus:ring-2 focus:ring-pink-100 outline-none text-sm">
                    </div>
                    <div class="flex-1">
                      <label class="block text-sm font-medium text-gray-700 mb-1">单位</label>
                      <select v-model="agent.cron_config.unit" class="w-full p-2 border border-gray-200 rounded-lg bg-gray-50 focus:ring-2 focus:ring-pink-100 outline-none text-sm">
                        <option value="minutes">分钟</option>
                        <option value="hours">小时</option>
                      </select>
                    </div>
                  </div>

                  <div class="w-2/3" v-if="agent.cron_config.type === 'daily'">
                    <label class="block text-sm font-medium text-gray-700 mb-1">执行时间</label>
                    <input type="time" v-model="agent.cron_config.time" class="w-full p-2 border border-gray-200 rounded-lg bg-gray-50 focus:ring-2 focus:ring-pink-100 outline-none text-sm">
                  </div>

                  <div class="w-2/3" v-if="agent.cron_config.type === 'cron'">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Cron 表达式</label>
                    <input type="text" v-model="agent.cron_config.expression" placeholder="* * * * *" class="w-full p-2 border border-gray-200 rounded-lg bg-gray-50 focus:ring-2 focus:ring-pink-100 outline-none text-sm font-mono">
                  </div>
                </div>

                <div class="mt-4">
                  <label class="block text-sm font-medium text-gray-700 mb-1">执行入参 (Prompt)</label>
                  <textarea v-model="agent.cron_config.prompt" placeholder="请输入定时调度触发时发给智能体的 Prompt..." class="w-full p-2 border border-gray-200 rounded-lg bg-gray-50 focus:ring-2 focus:ring-pink-100 outline-none text-sm resize-none" rows="2"></textarea>
                </div>

                <div class="flex justify-between items-center bg-pink-50 p-3 rounded-lg border border-pink-100 mt-4">
                  <span class="text-xs text-pink-700 font-medium">配置会在点击顶部「保存」后立即生效并在后台运行</span>
                  <button @click="openRunLogs" class="text-xs bg-white px-3 py-1.5 rounded-md border border-pink-200 text-pink-600 hover:bg-pink-100 transition shadow-sm font-medium flex items-center gap-1">
                    <Activity :size="14" />
                    查看运行记录
                  </button>
                </div>
              </div>
            </div>
          </section>

          <div class="pb-10"></div>
        </div>
      </div>

      <!-- Right Column: Debug Chat -->
      <div class="w-[45%] bg-gray-50 flex flex-col relative">
        <div class="absolute inset-0 opacity-40 pointer-events-none" style="background-image: radial-gradient(#cbd5e1 1px, transparent 1px); background-size: 20px 20px;"></div>
        
        <div class="h-12 bg-white/60 backdrop-blur border-b border-gray-200 flex items-center px-4 shrink-0 z-10">
          <MessageSquare :size="16" class="text-blue-600 mr-2" />
          <span class="text-sm font-bold text-gray-800">测试与预览 (Preview)</span>
          <div class="ml-auto flex items-center">
            <button @click="clearMemory" :disabled="isClearing || isChatting" class="text-gray-400 hover:text-red-500 transition px-2 py-1 flex items-center gap-1.5 text-xs font-medium rounded hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed">
              <Trash2 :size="14" />
              <span>清除记忆</span>
            </button>
          </div>
        </div>

        <!-- Chat History -->
        <div class="flex-1 overflow-y-auto p-4 space-y-6 z-10">
          <div v-for="(msg, index) in chatMessages" :key="index" class="flex" :class="msg.role === 'user' ? 'justify-end' : 'justify-start'">
            
            <div v-if="msg.role === 'assistant'" class="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 mr-3 mt-1 shadow-sm">
              <Bot :size="16" />
            </div>

            <div class="max-w-[80%] min-w-0 overflow-hidden rounded-2xl px-4 py-3 text-sm shadow-sm"
                 :class="msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'">
              <!-- 用户消息 -->
              <div v-if="msg.role === 'user'" class="whitespace-pre-wrap">
                <div>{{ getMessageContent(msg) }}</div>
                <div v-if="msg.segments" class="flex flex-wrap gap-2 mt-2">
                  <div v-for="img in msg.segments.filter((s: any) => s.type === 'image')" :key="img.file_name">
                    <img :src="img.base64" class="max-w-[150px] max-h-[150px] object-cover rounded-lg border border-blue-500/30" />
                  </div>
                  <div v-for="file in msg.segments.filter((s: any) => s.type === 'file_text')" :key="file.file_name" class="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700/50 rounded-lg text-blue-50 text-xs border border-blue-500/30">
                    <Paperclip :size="14" />
                    <span class="truncate max-w-[200px]">{{ file.file_name }}</span>
                  </div>
                </div>
              </div>
              
              <!-- 智能体消息：分段渲染 -->
              <div v-else class="space-y-2">
                <template v-for="(seg, si) in (msg.segments || [{ type: 'text', content: msg.content || '' }])" :key="si">
                  
                  <!-- 文字段 -->
                  <div v-if="seg.type === 'text' && seg.content" class="markdown-body max-w-full min-w-0 overflow-x-auto break-words" v-html="renderMarkdown(seg.content)"></div>
                  
                  <!-- 工具调用段 -->
                  <div v-else-if="seg.type === 'tool'" class="border-l-4 border-orange-400 bg-orange-50 rounded-r-lg p-3">
                    <div class="flex items-center gap-2 font-semibold text-orange-700 mb-2">
                      <svg :class="seg.done ? 'w-4 h-4 text-orange-500' : 'w-4 h-4 text-orange-500 animate-pulse'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                      </svg>
                      <span>{{ seg.done ? '已调用扩展能力' : '正在调用扩展能力' }}: {{ seg.tool_name }}</span>
                      <span v-if="!seg.done" class="ml-auto flex gap-0.5">
                        <span class="w-1.5 h-1.5 rounded-full bg-orange-400 animate-bounce" style="animation-delay:0ms"></span>
                        <span class="w-1.5 h-1.5 rounded-full bg-orange-400 animate-bounce" style="animation-delay:150ms"></span>
                        <span class="w-1.5 h-1.5 rounded-full bg-orange-400 animate-bounce" style="animation-delay:300ms"></span>
                      </span>
                    </div>
                    <pre v-if="seg.args" class="font-mono text-[11px] text-gray-500 bg-white/70 p-2 rounded border border-orange-100 overflow-x-auto whitespace-pre-wrap break-all" :title="seg.args">{{ seg.args.length > 300 ? seg.args.substring(0, 300) + '... (截断)' : seg.args }}</pre>
                    <div v-else-if="!seg.done" class="flex items-center gap-1.5 text-[11px] text-orange-400 italic">
                      <span class="w-1 h-1 rounded-full bg-orange-400 animate-pulse"></span>
                      正在构建参数...
                    </div>
                    
                    <div v-if="seg.result" class="mt-2 border-t border-orange-100/50 pt-2">
                      <details class="text-[11px]">
                        <summary class="text-orange-600 font-medium cursor-pointer select-none hover:text-orange-700 transition">查看执行结果</summary>
                        <pre class="mt-1.5 font-mono text-gray-500 bg-white/50 p-2 rounded border border-orange-50 overflow-x-auto whitespace-pre-wrap break-all max-h-40 overflow-y-auto">{{ seg.result }}</pre>
                      </details>
                    </div>
                  </div>
                  
                  <!-- 产物段 -->
                  <div v-else-if="seg.type === 'artifact'" class="p-3 bg-blue-50 border border-blue-200 rounded-xl">
                    <div class="flex items-center gap-3">
                      <div class="p-2 bg-blue-100 rounded-lg text-blue-600">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div class="flex-1 min-w-0">
                        <div class="text-sm font-semibold text-blue-900 truncate">📎 生成产物: {{ seg.file_name }}</div>
                        <div class="text-xs text-blue-400 truncate mt-0.5">{{ seg.file_path }}</div>
                      </div>
                      <a :href="seg.file_url" :download="seg.file_name" class="shrink-0 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition shadow-sm flex items-center gap-1">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        下载
                      </a>
                    </div>
                    <img v-if="seg.file_name?.match(/\.(png|jpg|jpeg|gif|webp)$/i)" :src="seg.file_url" class="mt-2 max-w-full h-auto rounded-lg border border-blue-100 shadow-sm" />
                  </div>

                </template>
              </div>
            </div>
            
            <div v-if="msg.role === 'user'" class="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center shrink-0 ml-3 mt-1 shadow-sm">
              <div class="text-xs text-gray-500 font-bold">ME</div>
            </div>

          </div>
        </div>

        <!-- Chat Input -->
        <div class="p-4 bg-white/80 backdrop-blur border-t border-gray-200 shrink-0 z-10 flex flex-col gap-2">
          
          <!-- Uploaded Files Preview -->
          <div v-if="uploadedFiles.length > 0" class="flex flex-wrap gap-2 mb-1">
            <div v-for="(file, idx) in uploadedFiles" :key="idx" class="relative group border border-gray-200 bg-white rounded-lg p-1.5 flex items-center gap-2 shadow-sm pr-6">
              <img v-if="file.type === 'image'" :src="file.base64" class="w-8 h-8 object-cover rounded" />
              <div v-else class="w-8 h-8 bg-gray-100 text-gray-500 rounded flex items-center justify-center">
                <Paperclip :size="14" />
              </div>
              <div class="text-xs text-gray-600 truncate max-w-[120px]">{{ file.file_name }}</div>
              <button @click="removeUploadedFile(idx)" class="absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 bg-red-100 text-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                <X :size="10" />
              </button>
            </div>
          </div>

          <div class="relative flex items-center bg-white border border-gray-300 rounded-2xl shadow-sm focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-400 transition overflow-hidden">
            <input type="file" ref="fileInput" class="hidden" @change="onFileChange" accept="*/*" />
            <button @click="triggerUpload" :disabled="isUploading || isChatting" class="absolute left-2 p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition disabled:opacity-50">
              <Loader2 v-if="isUploading" :size="18" class="animate-spin text-blue-500" />
              <Paperclip v-else :size="18" />
            </button>
            <input 
              v-model="chatInput" 
              @keyup.enter="sendMessage"
              type="text" 
              :placeholder="isChatting ? '正在回复中...' : '向智能体发送消息进行测试...'" 
              :disabled="isChatting"
              class="w-full py-3.5 pl-12 pr-12 outline-none text-sm bg-transparent disabled:opacity-60"
            />
            <button v-if="!isChatting" @click="sendMessage" class="absolute right-2 p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition disabled:opacity-50" :disabled="(!chatInput.trim() && uploadedFiles.length === 0)">
              <Send :size="18" />
            </button>
            <button v-else @click="stopChat" class="absolute right-2 p-2 text-red-500 hover:bg-red-50 rounded-xl transition cursor-pointer" title="终止生成">
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12"></rect></svg>
            </button>
          </div>
          <div class="text-center mt-1 text-[10px] text-gray-400 flex items-center justify-center gap-1">
            <span v-if="isChatting" class="inline-block w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
            当前基于真实的 TS/LangChain 底层引擎及 AG-UI 协议渲染
          </div>
        </div>

      </div>

    </div>
  </div>

  <!-- Prompt Generator Modal -->
  <div v-if="showPromptGenerator" class="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-[200]">
    <div class="bg-white rounded-2xl shadow-xl w-[420px] overflow-hidden border border-gray-100">
      <div class="px-6 py-4 border-b border-gray-100 flex items-center gap-2 bg-gradient-to-r from-purple-50 to-white">
        <Wand2 class="text-purple-600" :size="20" />
        <h3 class="font-bold text-gray-800 text-base">自动生成 System Prompt</h3>
      </div>
      <div class="p-6">
        <label class="block text-sm font-medium text-gray-700 mb-2">输入核心设定或关键词</label>
        <textarea 
          v-model="promptKeyword" 
          rows="3" 
          placeholder="例如：擅长 Python 数据分析，性格幽默，输出要求使用 Markdown 表格..." 
          class="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-100 focus:border-purple-400 outline-none transition text-sm resize-none"
        ></textarea>
        <p class="text-xs text-gray-400 mt-2">AI 将结合智能体当前名称及以上关键词，为您撰写一段专业的系统提示词。</p>
      </div>
      <div class="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
        <button @click="showPromptGenerator = false" :disabled="isGeneratingPrompt" class="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-50">取消</button>
        <button @click="confirmGeneratePrompt" :disabled="isGeneratingPrompt || !promptKeyword.trim()" class="px-4 py-2 text-sm text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition shadow-sm flex items-center gap-2 disabled:opacity-50">
          <span v-if="isGeneratingPrompt" class="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
          {{ isGeneratingPrompt ? '正在生成...' : '开始生成' }}
        </button>
      </div>
    </div>
  </div>

  <!-- Skill Binding Modal -->
  <div v-if="showSkillModal" class="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-[200]">
    <div class="bg-white rounded-2xl shadow-xl w-[500px] max-h-[80vh] flex flex-col overflow-hidden border border-gray-100">
      <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-orange-50 to-white">
        <div class="flex items-center gap-2">
          <Wrench class="text-orange-600" :size="20" />
          <h3 class="font-bold text-gray-800 text-base">绑定预设技能</h3>
        </div>
        <button @click="showSkillModal = false" class="text-gray-400 hover:text-gray-600"><X :size="20" /></button>
      </div>
      
      <div class="flex-1 overflow-y-auto p-4 space-y-2">
        <div v-if="availableSkills.length === 0" class="text-center py-8 text-gray-400 text-sm">
          暂无可用技能，请先前往“资源中心”导入技能包。
        </div>
        <div 
          v-else
          v-for="skill in availableSkills" 
          :key="skill.id"
          @click="toggleSkill(skill)"
          class="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition"
          :class="isSkillSelected(skill) ? 'border-orange-500 bg-orange-50/50' : 'border-gray-200 hover:border-orange-200 bg-white'"
        >
          <div class="mt-0.5 shrink-0">
            <div class="w-5 h-5 rounded border flex items-center justify-center" :class="isSkillSelected(skill) ? 'bg-orange-500 border-orange-500 text-white' : 'border-gray-300'">
              <Check v-if="isSkillSelected(skill)" :size="14" stroke-width="3" />
            </div>
          </div>
          <div>
            <div class="text-sm font-medium text-gray-900">{{ skill.name }}</div>
            <div class="text-xs text-gray-500 mt-1 line-clamp-2">{{ skill.description || '无描述' }}</div>
          </div>
        </div>
      </div>
      
      <div class="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
        <button @click="showSkillModal = false" class="px-5 py-2 text-sm text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition shadow-sm font-medium">完成选择</button>
      </div>
    </div>
  </div>

  <!-- MCP Binding Modal -->
  <div v-if="showMcpModal" class="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-[200]">
    <div class="bg-white rounded-2xl shadow-xl w-[500px] max-h-[80vh] flex flex-col overflow-hidden border border-gray-100">
      <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-white">
        <div class="flex items-center gap-2">
          <Zap class="text-indigo-600" :size="20" />
          <h3 class="font-bold text-gray-800 text-base">配置 MCP 服务器</h3>
        </div>
        <button @click="showMcpModal = false" class="text-gray-400 hover:text-gray-600"><X :size="20" /></button>
      </div>
      
      <div class="flex-1 overflow-y-auto p-4 space-y-2">
        <div v-if="availableMcpServers.length === 0" class="text-center py-8 text-gray-400 text-sm">
          暂无可用 MCP 服务器，请先前往“资源中心”添加。
        </div>
        <div 
          v-else
          v-for="mcp in availableMcpServers" 
          :key="mcp.id"
          @click="toggleMcpServer(mcp)"
          class="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition"
          :class="isMcpServerSelected(mcp) ? 'border-indigo-500 bg-indigo-50/50' : 'border-gray-200 hover:border-indigo-200 bg-white'"
        >
          <div class="mt-0.5 shrink-0">
            <div class="w-5 h-5 rounded border flex items-center justify-center" :class="isMcpServerSelected(mcp) ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-gray-300'">
              <Check v-if="isMcpServerSelected(mcp)" :size="14" stroke-width="3" />
            </div>
          </div>
          <div>
            <div class="text-sm font-medium text-gray-900">{{ mcp.name }}</div>
            <div class="text-xs text-gray-500 mt-1 line-clamp-2">类型: {{ mcp.type }} | 状态: {{ mcp.status === 'active' ? '在线' : '离线' }}</div>
          </div>
        </div>
      </div>
      
      <div class="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
        <button @click="showMcpModal = false" class="px-5 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition shadow-sm font-medium">完成选择</button>
      </div>
    </div>
  </div>

  <!-- Knowledge Base Binding Modal -->
  <div v-if="showKbModal" class="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-[200]">
    <div class="bg-white rounded-2xl shadow-xl w-[500px] max-h-[80vh] flex flex-col overflow-hidden border border-gray-100">
      <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-teal-50 to-white">
        <div class="flex items-center gap-2">
          <Database class="text-teal-600" :size="20" />
          <h3 class="font-bold text-gray-800 text-base">配置知识库</h3>
        </div>
        <button @click="showKbModal = false" class="text-gray-400 hover:text-gray-600"><X :size="20" /></button>
      </div>
      
      <div class="flex-1 overflow-y-auto p-4 space-y-2">
        <div v-if="availableKnowledgeBases.length === 0" class="text-center py-8 text-gray-400 text-sm">
          暂无可用知识库，请先前往“资源中心”添加。
        </div>
        <div 
          v-else
          v-for="kb in availableKnowledgeBases" 
          :key="kb.id"
          @click="toggleKb(kb)"
          class="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition"
          :class="isKbSelected(kb) ? 'border-teal-500 bg-teal-50/50' : 'border-gray-200 hover:border-teal-200 bg-white'"
        >
          <div class="mt-0.5 shrink-0">
            <div class="w-5 h-5 rounded border flex items-center justify-center" :class="isKbSelected(kb) ? 'bg-teal-500 border-teal-500 text-white' : 'border-gray-300'">
              <Check v-if="isKbSelected(kb)" :size="14" stroke-width="3" />
            </div>
          </div>
          <div>
            <div class="text-sm font-medium text-gray-900">{{ kb.name }}</div>
            <div class="text-xs text-gray-500 mt-1 line-clamp-2">{{ kb.description || '无描述' }}</div>
          </div>
        </div>
      </div>
      
      <div class="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
        <button @click="showKbModal = false" class="px-5 py-2 text-sm text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition shadow-sm font-medium">完成选择</button>
      </div>
    </div>
  </div>

  <!-- Tools Binding Modal -->
  <div v-if="showToolModal" class="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-[200]">
    <div class="bg-white rounded-2xl shadow-xl w-[500px] max-h-[80vh] flex flex-col overflow-hidden border border-gray-100">
      <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-blue-50 to-white">
        <div class="flex items-center gap-2">
          <Puzzle class="text-blue-600" :size="20" />
          <h3 class="font-bold text-gray-800 text-base">配置工具箱</h3>
        </div>
        <button @click="showToolModal = false" class="text-gray-400 hover:text-gray-600"><X :size="20" /></button>
      </div>
      
      <div class="flex-1 overflow-y-auto p-4 space-y-2">
        <div v-if="availableTools.length === 0" class="text-center py-8 text-gray-400 text-sm">
          暂无可用扩展工具，请先前往“资源中心”添加。
        </div>
        <div 
          v-else
          v-for="tool in availableTools" 
          :key="tool.id"
          @click="toggleTool(tool)"
          class="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition"
          :class="isToolSelected(tool) ? 'border-blue-500 bg-blue-50/50' : 'border-gray-200 hover:border-blue-200 bg-white'"
        >
          <div class="mt-0.5 shrink-0">
            <div class="w-5 h-5 rounded border flex items-center justify-center" :class="isToolSelected(tool) ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-300'">
              <Check v-if="isToolSelected(tool)" :size="14" stroke-width="3" />
            </div>
          </div>
          <div>
            <div class="text-sm font-medium text-gray-900">{{ tool.name }}</div>
            <div class="text-xs text-gray-500 mt-1 line-clamp-2">{{ tool.description || '无描述' }}</div>
          </div>
        </div>
      </div>
      
      <div class="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
        <button @click="showToolModal = false" class="px-5 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-sm font-medium">完成选择</button>
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
          <button type="button" @click.stop.prevent="showRunLogsModal = false" class="text-gray-400 hover:text-gray-800 cursor-pointer p-2 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors z-50 relative">
            <X :size="20" class="pointer-events-none" />
          </button>
        </div>
      </div>
      
      <div class="flex-1 overflow-y-auto bg-gray-50 p-4">
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
</template>

<style scoped>
/* 隐藏数字输入框的箭头 */
input[type=number]::-webkit-inner-spin-button, 
input[type=number]::-webkit-outer-spin-button { 
  -webkit-appearance: none; 
  margin: 0; 
}

/* Markdown Styles */
:deep(.markdown-body) {
  line-height: 1.6;
}
:deep(.markdown-body p) {
  margin-bottom: 0.75em;
}
:deep(.markdown-body p:last-child) {
  margin-bottom: 0;
}
:deep(.markdown-body pre) {
  background-color: #f1f5f9;
  padding: 1em;
  border-radius: 0.5rem;
  overflow-x: auto;
  margin: 1em 0;
}
:deep(.markdown-body code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.85em;
  background-color: #f1f5f9;
  padding: 0.2em 0.4em;
  border-radius: 3px;
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
:deep(.markdown-body a) {
  color: #2563eb;
  text-decoration: underline;
  word-break: break-all;
  overflow-wrap: break-word;
}
:deep(.markdown-body table) {
  width: 100%;
  border-collapse: collapse;
  margin: 1em 0;
}
:deep(.markdown-body th), :deep(.markdown-body td) {
  border: 1px solid #e2e8f0;
  padding: 0.5em;
  text-align: left;
}
:deep(.markdown-body th) {
  background-color: #f8fafc;
}
:deep(.markdown-body strong) {
  font-weight: 600;
}
</style>
