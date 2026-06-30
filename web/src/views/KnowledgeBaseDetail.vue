<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import request from '../utils/request'
import { Message } from '../utils/message'
import { ChevronLeft, Database, Search, UploadCloud, FileText, Trash2, ChevronDown, Activity, Save, Send, Loader2 } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const kbId = route.params.id

const isSaving = ref(false)
const kb = ref({
  id: kbId,
  name: '',
  description: '',
  config: { type: 'local', url: '', method: 'GET', headers: '{}', body: '', json_path: '$.', result_text_field: '' } as any
})

const kbFiles = ref<any[]>([])
const expandedKbFile = ref<string | null>(null)
const kbChunksCache = ref<Record<string, any[]>>({})

const fetchKb = async () => {
  try {
    const { data } = await request.get(`/api/knowledge_bases/${kbId}`)
    kb.value.name = data.name || ''
    kb.value.description = data.description || ''
    if (data.config) {
      try {
        kb.value.config = typeof data.config === 'string' ? JSON.parse(data.config) : data.config
      } catch (e) {
        kb.value.config = { type: 'local', url: '', method: 'GET', headers: '{}', body: '', json_path: '$.', result_text_field: '' }
      }
    }
    await fetchKbFiles()
  } catch (error) {
    Message.error('加载数据失败')
    router.push('/console/resources')
  }
}

const fetchKbFiles = async () => {
  if (!kbId || kb.value.config.type !== 'local') return
  try {
    const { data } = await request.get(`/api/knowledge_bases/${kbId}/files`)
    if (data.success) kbFiles.value = data.files
  } catch(e) {
    console.error('Failed to fetch KB files:', e)
  }
}

const saveKb = async () => {
  isSaving.value = true
  try {
    const payload = {
      name: kb.value.name,
      description: kb.value.description,
      config: JSON.stringify(kb.value.config)
    }
    await request.put(`/api/knowledge_bases/${kbId}`, payload)
    // Silently saved
  } catch (error: any) {
    Message.error('保存失败: ' + error.message)
  } finally {
    isSaving.value = false
  }
}

// Auto save watch
let saveTimer: any
watch(() => kb.value, () => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    if (kb.value.name) saveKb()
  }, 1000)
}, { deep: true })


const kbFileSelected = ref<File | null>(null)
const kbFileInput = ref<HTMLInputElement | null>(null)
const isUploadingKb = ref(false)

const triggerKbFileInput = () => {
  if (kbFileInput.value) kbFileInput.value.click()
}

const handleKbFileSelected = (e: Event) => {
  const target = e.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    kbFileSelected.value = target.files[0]
  }
}

const uploadKbFile = async () => {
  if (!kbFileSelected.value) return Message.error('请先选择文件')
  isUploadingKb.value = true
  try {
    const fd = new FormData()
    fd.append('file', kbFileSelected.value)
    const { data } = await request.post(`/api/knowledge_bases/${kbId}/upload`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    Message.success(`✅ 解析成功！文档被切分为 ${data.chunks_count} 个块。`)
    kbFileSelected.value = null
    await fetchKbFiles()
  } catch(e: any) {
    Message.error(`❌ 上传或解析失败：${e.response?.data?.error || e.message}`)
  } finally {
    isUploadingKb.value = false
  }
}

const toggleKbFileChunks = async (filename: string) => {
  if (expandedKbFile.value === filename) {
    expandedKbFile.value = null
    return
  }
  expandedKbFile.value = filename
  if (!kbChunksCache.value[filename]) {
    try {
      const { data } = await request.get(`/api/knowledge_bases/${kbId}/files/${filename}/chunks`)
      if (data.success) kbChunksCache.value[filename] = data.chunks
    } catch(e) {
      console.error('Failed to fetch KB chunks:', e)
    }
  }
}

const deleteKbFile = async (filename: string) => {
  if (!confirm(`确定要从知识库中删除文档 ${filename} 吗？\n相关向量训练数据将被清空。`)) return
  try {
    const { data } = await request.delete(`/api/knowledge_bases/${kbId}/files/${filename}`)
    if (data.success) {
      Message.success('已删除该文档')
      await fetchKbFiles()
    }
  } catch(e: any) {
    Message.error(`删除失败: ${e.response?.data?.error || e.message}`)
  }
}

// Testing
const isTestingKb = ref(false)
const testQuery = ref('')
const testHistory = ref<{ query: string, loading?: boolean, results?: any[], error?: string }[]>([])

const testKnowledgeBase = async () => {
  const q = testQuery.value.trim()
  if (!q) return
  
  testQuery.value = ''
  const chatItem: { query: string, loading?: boolean, results?: any[], error?: string } = { query: q, loading: true }
  testHistory.value.push(chatItem)
  
  isTestingKb.value = true
  try {
    const payload = {
       type: kb.value.config.type,
       url: kb.value.config.url,
       method: kb.value.config.method,
       headers: kb.value.config.headers,
       body: kb.value.config.body,
       json_path: kb.value.config.json_path,
       result_text_field: kb.value.config.result_text_field,
       test_query: q,
       id: kbId
    }
    const { data } = await request.post('/api/knowledge_bases/test', payload)
    
    chatItem.loading = false
    if (Array.isArray(data.result)) {
      chatItem.results = data.result
    } else {
      chatItem.results = [{ text: JSON.stringify(data.result, null, 2) }]
    }
  } catch(e: any) {
    chatItem.loading = false
    chatItem.error = e.response?.data?.error || e.message
  } finally {
    isTestingKb.value = false
  }
}

onMounted(() => {
  fetchKb()
})
</script>

<template>
  <div class="h-screen w-screen flex flex-col bg-gray-50 fixed inset-0 z-[100]">
    <div class="h-8 w-full bg-white shrink-0" style="-webkit-app-region: drag"></div>
    <!-- Header -->
    <header class="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 shrink-0 shadow-sm z-10" style="-webkit-app-region: drag">
      <div class="flex items-center gap-4" style="-webkit-app-region: no-drag">
        <button @click="router.push('/console/resources')" class="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition">
          <ChevronLeft :size="20" />
        </button>
        <div class="h-5 w-px bg-gray-300"></div>
        <div class="flex items-center gap-2">
          <input v-model="kb.name" class="font-bold text-gray-800 text-lg bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-blue-100 rounded px-1 w-64" placeholder="知识库名称" />
        </div>
      </div>
      <div class="flex items-center gap-3" style="-webkit-app-region: no-drag">
        <div class="text-xs text-gray-400 flex items-center gap-1">
          <div class="w-2 h-2 rounded-full" :class="isSaving ? 'bg-orange-400 animate-pulse' : 'bg-green-400'"></div>
          {{ isSaving ? '保存中...' : '已自动保存' }}
        </div>
      </div>
    </header>

    <!-- Main Content: 2 Columns -->
    <div class="flex flex-1 overflow-hidden">
      <!-- Left Column: Configuration -->
      <div class="w-[50%] flex flex-col bg-white border-r border-gray-200 overflow-y-auto">
        <div class="p-6 max-w-2xl mx-auto w-full space-y-8">
          
          <section>
            <div class="flex items-center gap-2 mb-3">
              <Database class="text-blue-600" :size="20" />
              <h2 class="text-lg font-bold text-gray-900">知识库设定</h2>
            </div>
            <textarea 
              v-model="kb.description" 
              class="w-full h-24 p-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none text-sm resize-y"
              placeholder="简要描述知识库的用途..."
            ></textarea>
          </section>

          <section>
            <label class="block text-sm font-bold text-gray-900 mb-3">库类型 (Type)</label>
            <div class="flex gap-6 mb-4">
              <div v-if="kb.config.type === 'local'" class="flex items-center gap-2">
                <div class="w-4 h-4 rounded-full border-4 border-blue-600 flex items-center justify-center"></div>
                <span class="text-sm font-medium text-gray-800">本地知识库 (Local RAG)</span>
              </div>
              <div v-if="kb.config.type === 'remote'" class="flex items-center gap-2">
                <div class="w-4 h-4 rounded-full border-4 border-blue-600 flex items-center justify-center"></div>
                <span class="text-sm font-medium text-gray-800">第三方远程接口 (Remote API)</span>
              </div>
            </div>

            <!-- Local KB Config -->
            <div v-if="kb.config.type === 'local'" class="space-y-4 border border-blue-100 bg-blue-50/30 rounded-xl p-5">
              <div class="flex flex-col items-center justify-center p-6 border-2 border-dashed border-blue-200 rounded-xl bg-white hover:bg-blue-50/50 transition cursor-pointer" @click="triggerKbFileInput">
                <input type="file" ref="kbFileInput" class="hidden" accept=".txt,.md,.pdf,.docx,.csv,.xlsx" @change="handleKbFileSelected" />
                <div class="p-3 bg-blue-100 text-blue-500 rounded-full mb-3"><FileText :size="24" /></div>
                <div v-if="kbFileSelected" class="text-sm font-medium text-blue-700 mb-1">已选择: {{ kbFileSelected.name }}</div>
                <div v-else class="text-sm font-medium text-gray-700 mb-1">点击选择文档 (支持 txt, md, pdf, docx, excel)</div>
                <p class="text-xs text-gray-400">选择文档后点击下方按钮上传并解析为向量数据</p>
              </div>
              
              <div class="flex justify-center">
                <button type="button" @click="uploadKbFile" class="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition shadow-sm flex items-center gap-2 disabled:opacity-50" :disabled="isUploadingKb || !kbFileSelected">
                  <span v-if="isUploadingKb" class="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <UploadCloud v-else :size="16" />
                  {{ isUploadingKb ? '正在解析与生成向量...' : '上传并追加文档' }}
                </button>
              </div>

              <div v-if="kbFiles.length > 0" class="mt-6 pt-4 border-t border-blue-100">
                <h4 class="text-sm font-bold text-gray-800 mb-3">已入库文档 ({{ kbFiles.length }})</h4>
                <div class="space-y-2 max-h-96 overflow-y-auto pr-2">
                  <div v-for="file in kbFiles" :key="file.file_name" class="border border-gray-200 bg-white rounded-lg overflow-hidden shadow-sm">
                    <div class="flex items-center justify-between p-3 hover:bg-gray-50 transition cursor-pointer" @click="toggleKbFileChunks(file.file_name)">
                      <div class="flex items-center gap-2 overflow-hidden flex-1">
                        <FileText class="text-blue-500 shrink-0" :size="16" />
                        <span class="text-sm font-medium text-gray-700 truncate" :title="file.file_name">{{ file.file_name }}</span>
                        <span class="text-xs text-gray-400 whitespace-nowrap bg-gray-100 px-2 py-0.5 rounded-full">{{ file.chunk_count }} 个切片</span>
                      </div>
                      <div class="flex items-center gap-2 shrink-0">
                        <button @click.stop="deleteKbFile(file.file_name)" class="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition" title="删除文档">
                          <Trash2 :size="14" />
                        </button>
                        <ChevronDown class="text-gray-400 transition-transform" :class="{'rotate-180': expandedKbFile === file.file_name}" :size="16" />
                      </div>
                    </div>
                    <div v-if="expandedKbFile === file.file_name" class="p-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-600">
                      <div v-if="!kbChunksCache[file.file_name]" class="text-center py-2 animate-pulse text-gray-400">正在加载数据块...</div>
                      <div v-else class="space-y-2">
                        <div v-for="(chunk, idx) in kbChunksCache[file.file_name]" :key="chunk.id" class="p-2 bg-white rounded border border-gray-200 font-mono leading-relaxed max-h-40 overflow-y-auto">
                          <span class="text-blue-500 font-bold mr-1">[{{ idx + 1 }}]</span>
                          {{ chunk.chunk_text }}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Remote KB Config -->
            <div v-if="kb.config.type === 'remote'" class="space-y-4 p-4 border border-blue-100 bg-blue-50/30 rounded-xl">
              <div class="grid grid-cols-3 gap-4">
                <div class="col-span-2">
                  <label class="block text-sm font-medium text-gray-700 mb-1">请求地址 (URL)</label>
                  <input v-model="kb.config.url" type="text" placeholder="https://api.example.com/search" class="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-100 outline-none text-sm font-mono" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">方法 (Method)</label>
                  <select v-model="kb.config.method" class="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-100 outline-none bg-white text-sm">
                    <option>GET</option>
                    <option>POST</option>
                  </select>
                </div>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">请求头 (Headers JSON)</label>
                <textarea v-model="kb.config.headers" rows="2" placeholder='{"Authorization": "Bearer XXX"}' class="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-100 outline-none font-mono text-xs"></textarea>
              </div>
              <div v-if="kb.config.method !== 'GET'">
                <label class="block text-sm font-medium text-gray-700 mb-1">请求体 (Body JSON)</label>
                <textarea v-model="kb.config.body" rows="3" placeholder='{"query": "{{query}}"}' class="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-100 outline-none font-mono text-xs"></textarea>
                <p class="text-[10px] text-gray-500 mt-1">支持在 Body 中使用 `\{\{query\}\}` 作为搜索词占位符。</p>
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">结果提取路径 (JSON Path)</label>
                  <input v-model="kb.config.json_path" type="text" placeholder="例如: $.data.results" class="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-100 outline-none font-mono text-xs" />
                  <p class="text-[10px] text-gray-500 mt-1">提取返回的数组节点，例如 `$.data.list`</p>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">内容映射字段 (Content Field)</label>
                  <input v-model="kb.config.result_text_field" type="text" placeholder="例如: content 或 text" class="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-100 outline-none font-mono text-xs" />
                  <p class="text-[10px] text-gray-500 mt-1">从数组元素中提取该字段作为文本块展示</p>
                </div>
              </div>
            </div>
          </section>

        </div>
      </div>

      <!-- Right Column: Retrieval Testing -->
      <div class="flex-1 flex flex-col bg-gray-50">
        <div class="p-4 bg-white border-b border-gray-200 shrink-0 flex items-center justify-between shadow-sm z-10">
          <div class="flex items-center gap-2">
            <Search class="text-indigo-600" :size="20" />
            <h3 class="font-bold text-gray-800">检索仿真实验室</h3>
          </div>
        </div>
        
        <div class="flex-1 overflow-y-auto p-6 space-y-6">
          <div v-if="testHistory.length === 0" class="flex flex-col items-center justify-center h-full text-gray-400">
            <Activity :size="48" class="mb-4 text-indigo-200" />
            <p>在下方输入框中提问，测试您的知识库召回效果。</p>
          </div>
          
          <div v-for="(item, index) in testHistory" :key="index" class="space-y-4">
            <!-- User Query -->
            <div class="flex justify-end">
              <div class="max-w-[80%] bg-indigo-600 text-white p-3 rounded-2xl rounded-tr-none shadow-sm text-sm whitespace-pre-wrap leading-relaxed">
                {{ item.query }}
              </div>
            </div>
            
            <!-- Result Output -->
            <div class="flex justify-start">
              <div class="max-w-[90%] flex gap-3">
                <div class="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                  <Database class="text-indigo-600" :size="16" />
                </div>
                <div class="bg-white border border-gray-200 p-4 rounded-2xl rounded-tl-none shadow-sm text-sm text-gray-700 w-full min-w-[200px]">
                  <div v-if="item.loading" class="flex items-center gap-2 text-indigo-500">
                    <Loader2 class="animate-spin" :size="16" /> 正在提取知识库数据...
                  </div>
                  <div v-else-if="item.error" class="text-red-500 flex items-center gap-2">
                    <X :size="16" /> {{ item.error }}
                  </div>
                  <div v-else-if="item.results && item.results.length === 0" class="text-gray-500">
                    无匹配数据返回。
                  </div>
                  <div v-else class="space-y-3">
                    <div v-if="kb.config.type === 'local'" class="text-xs text-gray-500 mb-2 border-b border-gray-100 pb-2">检索到 {{ item.results?.length }} 个片段：</div>
                    <div v-for="(res, idx) in item.results" :key="idx" class="p-3 bg-indigo-50/50 rounded-lg border border-indigo-100">
                      <div v-if="typeof res.similarity === 'number'" class="flex items-center justify-between mb-2">
                        <span class="text-xs font-bold text-indigo-700 flex items-center gap-1"><FileText :size="12"/> {{ res.file_name || '知识库文档' }}</span>
                        <span class="text-xs px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 font-mono">得分: {{ res.similarity.toFixed(4) }}</span>
                      </div>
                      <div class="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">{{ res.chunk_text || res.text || res }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="p-4 bg-white border-t border-gray-200 shrink-0">
          <div class="relative max-w-4xl mx-auto flex items-end bg-white border border-gray-300 rounded-2xl focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition-all p-1 pl-4 shadow-sm">
            <textarea
              v-model="testQuery"
              rows="2"
              class="w-full bg-transparent border-none focus:outline-none resize-none py-2 text-sm max-h-32 text-gray-700 leading-relaxed"
              placeholder="输入你想测试检索的关键词或问题..."
              @keydown.enter.exact.prevent="testKnowledgeBase"
            ></textarea>
            <button 
              @click="testKnowledgeBase"
              :disabled="!testQuery.trim() || isTestingKb"
              class="ml-2 mb-1 p-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl transition flex items-center justify-center shrink-0"
            >
              <Loader2 v-if="isTestingKb" class="animate-spin" :size="18" />
              <Send v-else :size="18" />
            </button>
          </div>
          <div class="text-center mt-2">
            <span class="text-[10px] text-gray-400">Press <kbd class="px-1 py-0.5 bg-gray-100 rounded text-gray-500 font-mono">Enter</kbd> to test, <kbd class="px-1 py-0.5 bg-gray-100 rounded text-gray-500 font-mono">Shift</kbd> + <kbd class="px-1 py-0.5 bg-gray-100 rounded text-gray-500 font-mono">Enter</kbd> for new line</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
