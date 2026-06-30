<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { SlidersHorizontal, Copy, Check } from 'lucide-vue-next'
import request from '../utils/request'
import { Message } from '../utils/message'

const props = defineProps<{
  node: any | null
}>()

const emit = defineEmits(['update:node'])

const agents = ref<any[]>([])
const knowledgeBases = ref<any[]>([])
const plugins = ref<any[]>([])
const modelsList = ref<any[]>([])

const copied = ref(false)
const copyNodeId = async () => {
  if (!props.node?.id) return
  try {
    await navigator.clipboard.writeText(props.node.id)
    copied.value = true
    Message.success('已复制节点 ID')
    setTimeout(() => { copied.value = false }, 2000)
  } catch (err) {
    Message.error('复制失败')
  }
}

const fetchResources = async () => {
  try {
    const [resAgents, resKb, resPlugins, resModels] = await Promise.all([
      request.get('/api/agents'),
      request.get('/api/knowledge_bases'),
      request.get('/api/tools'),
      request.get('/api/models')
    ])
    agents.value = resAgents.data || []
    knowledgeBases.value = resKb.data || []
    plugins.value = resPlugins.data || []
    modelsList.value = resModels.data || []
  } catch (err) {
    Message.error('获取资源列表失败')
  }
}

onMounted(() => {
  fetchResources()
})

const updateData = (key: string, value: any) => {
  if (!props.node) return
  emit('update:node', {
    ...props.node,
    data: {
      ...props.node.data,
      [key]: value
    }
  })
}

const updateAgent = (id: string) => {
  const agent = agents.value.find(a => a.id.toString() === id)
  if (!props.node) return
  emit('update:node', {
    ...props.node,
    data: { ...props.node.data, agentId: id, agentName: agent ? agent.name : '' }
  })
}

const updateKb = (id: string) => {
  const kb = knowledgeBases.value.find(k => k.id.toString() === id)
  if (!props.node) return
  emit('update:node', {
    ...props.node,
    data: { ...props.node.data, kbId: id, kbName: kb ? kb.name : '' }
  })
}

const updatePlugin = (id: string) => {
  const plugin = plugins.value.find(p => p.id.toString() === id)
  if (!props.node) return
  emit('update:node', {
    ...props.node,
    data: { ...props.node.data, pluginId: id, pluginName: plugin ? plugin.name : '' }
  })
}

// API params management
const updateApiParams = () => {
  if (!props.node) return
  emit('update:node', { ...props.node })
}

const addApiHeader = () => {
  if (!props.node) return
  const headers = props.node.data.headers || []
  headers.push({ key: '', value: '' })
  updateData('headers', headers)
}

const removeApiHeader = (index: number) => {
  if (!props.node) return
  const headers = props.node.data.headers || []
  headers.splice(index, 1)
  updateData('headers', headers)
}

const addApiBody = () => {
  if (!props.node) return
  const bodyParams = props.node.data.bodyParams || []
  bodyParams.push({ key: '', value: '' })
  updateData('bodyParams', bodyParams)
}

const removeApiBody = (index: number) => {
  if (!props.node) return
  const bodyParams = props.node.data.bodyParams || []
  bodyParams.splice(index, 1)
  updateData('bodyParams', bodyParams)
}

// Selector cases management
const addSelectorCase = () => {
  if (!props.node) return
  const cases = [...(props.node.data.cases || [])]
  cases.push({ condition: "input.type === 'new'", label: "新分支" })
  updateData('cases', cases)
}

const updateSelectorCase = () => {
  if (!props.node) return
  const cases = [...(props.node.data.cases || [])]
  updateData('cases', cases)
}

const removeSelectorCase = (index: number) => {
  if (!props.node) return
  const cases = [...(props.node.data.cases || [])]
  cases.splice(index, 1)
  updateData('cases', cases)
}
</script>

<template>
  <aside class="w-80 flex flex-col z-10 overflow-hidden" v-if="node">
    <div class="h-14 bg-white/50 border-b border-gray-100 flex items-center px-5 font-bold text-gray-800 backdrop-blur-sm">
      <SlidersHorizontal :size="18" class="mr-2 text-blue-500" /> 节点配置
      <span class="ml-auto text-xs text-gray-400 bg-white px-2 py-1 rounded border">{{ node.type }}</span>
    </div>

    <div class="p-5 overflow-y-auto flex-1">
      <!-- Common ID & Name -->
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 mb-1">节点 ID</label>
        <div class="flex items-center gap-2">
          <code class="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-xs text-gray-500 font-mono truncate select-all">
            {{ node.id }}
          </code>
          <button 
            @click="copyNodeId"
            class="p-2 border border-gray-200 rounded-md hover:bg-gray-50 text-gray-500 transition-colors"
            title="复制节点 ID"
          >
            <Check v-if="copied" :size="16" class="text-green-500" />
            <Copy v-else :size="16" />
          </button>
        </div>
      </div>

      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 mb-1">节点名称</label>
        <input 
          type="text" 
          :value="node.data.label" 
          @input="e => updateData('label', (e.target as HTMLInputElement).value)"
          class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
        />
      </div>

      <!-- LLM Specific Properties -->
      <template v-if="node.type === 'llm'">
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-1">模型选择</label>
          <select 
            :value="node.data.model || ''"
            @change="e => updateData('model', (e.target as HTMLSelectElement).value)"
            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="">请选择大模型</option>
            <option v-for="m in modelsList" :key="m.id" :value="m.model_name">{{ m.name }} ({{ m.model_name }})</option>
          </select>
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-1 flex items-center justify-between">
            System Prompt
            <span class="text-[10px] text-blue-500 font-normal bg-blue-50 px-1.5 py-0.5 rounded cursor-help" title="支持 Dify 变量语法">支持引用上游变量</span>
          </label>
          <textarea 
            :value="node.data.systemPrompt"
            @input="e => updateData('systemPrompt', (e.target as HTMLTextAreaElement).value)"
            rows="4"
            placeholder="你是智能助理...\n\n你可以使用 {{#start_node.query#}} 来引用开始节点的参数"
            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
          ></textarea>
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-1 flex items-center justify-between">
            用户提问 (User Query)
            <span class="text-[10px] text-blue-500 font-normal bg-blue-50 px-1.5 py-0.5 rounded cursor-help" title="支持 Dify 变量语法">支持引用上游变量</span>
          </label>
          <textarea 
            :value="node.data.query"
            @input="e => updateData('query', (e.target as HTMLTextAreaElement).value)"
            placeholder="{{#start_node.query#}}"
            rows="3"
            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
          ></textarea>
          <p class="text-[11px] text-gray-400 mt-1 leading-tight">使用 <code v-pre class="bg-gray-100 px-1 py-0.5 rounded text-gray-500">{{#节点ID.输出变量#}}</code> 格式可动态引用上游节点数据。</p>
        </div>
      </template>

      <!-- Start Node Specific -->
      <template v-if="node.type === 'start'">
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-1">入参定义</label>
          <textarea 
            :value="node.data.inputSchema"
            @input="e => updateData('inputSchema', (e.target as HTMLTextAreaElement).value)"
            rows="3"
            placeholder="{&quot;query&quot;: &quot;string&quot;}"
            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
          ></textarea>
        </div>
      </template>

      <!-- API Node Specific -->
      <template v-if="node.type === 'api'">
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-1">请求方法</label>
          <select 
            :value="node.data.method || 'GET'"
            @change="e => updateData('method', (e.target as HTMLSelectElement).value)"
            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="DELETE">DELETE</option>
          </select>
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-1">API URL</label>
          <input 
            type="text" 
            :value="node.data.url" 
            @input="e => updateData('url', (e.target as HTMLInputElement).value)"
            placeholder="https://api.example.com/v1/data"
            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-1">Headers (Key-Value)</label>
          <div class="space-y-2">
            <div v-for="(header, index) in (node.data.headers || [])" :key="index" class="flex gap-2 items-center">
              <input type="text" v-model="header.key" @change="updateApiParams" placeholder="Key" class="w-1/3 px-2 py-1 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <input type="text" v-model="header.value" @change="updateApiParams" placeholder="Value" class="w-full px-2 py-1 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <button @click="removeApiHeader(index)" class="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 size="14"/></button>
            </div>
            <button @click="addApiHeader" class="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">+ 添加 Header</button>
          </div>
        </div>
        <div class="mb-4" v-if="['POST', 'PUT'].includes(node.data.method)">
          <label class="block text-sm font-medium text-gray-700 mb-1">Body (Key-Value)</label>
          <div class="space-y-2">
            <div v-for="(bodyItem, index) in (node.data.bodyParams || [])" :key="index" class="flex gap-2 items-center">
              <input type="text" v-model="bodyItem.key" @change="updateApiParams" placeholder="Key" class="w-1/3 px-2 py-1 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <input type="text" v-model="bodyItem.value" @change="updateApiParams" placeholder="Value (支持变量)" class="w-full px-2 py-1 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <button @click="removeApiBody(index)" class="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 size="14"/></button>
            </div>
            <button @click="addApiBody" class="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">+ 添加 Body 参数</button>
          </div>
        </div>
      </template>

      <!-- Code Node Specific -->
      <template v-if="node.type === 'code'">
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-1 flex items-center justify-between">
            输入变量 (Input)
            <span class="text-[10px] text-blue-500 font-normal bg-blue-50 px-1.5 py-0.5 rounded cursor-help" title="支持 Dify 变量语法">支持引用上游变量</span>
          </label>
          <textarea 
            :value="node.data.systemPrompt"
            @input="e => updateData('systemPrompt', (e.target as HTMLTextAreaElement).value)"
            rows="2"
            placeholder="例如: {{#start_node.query#}}"
            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
          ></textarea>
          <p class="text-[11px] text-gray-400 mt-1 leading-tight">变量将被作为 <code class="bg-gray-100 px-1 py-0.5 rounded text-gray-500">args</code> 传入 python main() 函数。</p>
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-1">Python 代码片段</label>
          <textarea 
            :value="node.data.code"
            @input="e => updateData('code', (e.target as HTMLTextAreaElement).value)"
            rows="8"
            placeholder="def main(args):&#10;    return args"
            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono bg-zinc-50"
          ></textarea>
        </div>
      </template>

      <!-- Agent Node Specific -->
      <template v-if="node.type === 'agent' || node.type === 'batch_agent'">
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-1">选择智能体</label>
          <select 
            :value="node.data.agentId || ''"
            @change="e => updateAgent((e.target as HTMLSelectElement).value)"
            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="" disabled>-- 请选择智能体 --</option>
            <option v-for="agent in agents" :key="agent.id" :value="agent.id.toString()">{{ agent.name }}</option>
          </select>
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-1 flex items-center justify-between">
            系统提示词 (System Prompt)
          </label>
          <textarea 
            :value="node.data.systemPrompt"
            @input="e => updateData('systemPrompt', (e.target as HTMLTextAreaElement).value)"
            rows="3"
            placeholder="你是一个有用的助手..."
            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
          ></textarea>
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-1 flex items-center justify-between">
            用户查询 (User Query)
            <span class="text-[10px] text-blue-500 font-normal bg-blue-50 px-1.5 py-0.5 rounded cursor-help" title="支持 Dify 变量语法">支持引用上游变量</span>
          </label>
          <textarea 
            :value="node.data.userQuery"
            @input="e => updateData('userQuery', (e.target as HTMLTextAreaElement).value)"
            rows="2"
            placeholder="例如: {{#start_node.query#}}"
            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
          ></textarea>
          <p class="text-[11px] text-gray-400 mt-1 leading-tight">使用 <code v-pre class="bg-gray-100 px-1 py-0.5 rounded text-gray-500">{{#节点ID.输出变量#}}</code> 格式可动态接收上游参数。</p>
        </div>
      </template>

      <!-- Knowledge Base Node Specific -->
      <template v-if="node.type === 'knowledge_base'">
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-1">选择知识库</label>
          <select 
            :value="node.data.kbId || ''"
            @change="e => updateKb((e.target as HTMLSelectElement).value)"
            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="" disabled>-- 请选择知识库 --</option>
            <option v-for="kb in knowledgeBases" :key="kb.id" :value="kb.id.toString()">{{ kb.name }}</option>
          </select>
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-1 flex items-center justify-between">
            输入查询 (Input Query)
            <span class="text-[10px] text-blue-500 font-normal bg-blue-50 px-1.5 py-0.5 rounded cursor-help" title="支持 Dify 变量语法">支持引用上游变量</span>
          </label>
          <textarea 
            :value="node.data.query"
            @input="e => updateData('query', (e.target as HTMLTextAreaElement).value)"
            rows="2"
            placeholder="例如: {{#start_node.query#}}"
            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
          ></textarea>
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-1">检索 Top K</label>
          <input 
            type="number" 
            :value="node.data.topK || 3" 
            @input="e => updateData('topK', Number((e.target as HTMLInputElement).value))"
            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
      </template>

      <!-- Plugin Node Specific -->
      <template v-if="node.type === 'plugin'">
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-1">选择插件工具</label>
          <select 
            :value="node.data.pluginId || ''"
            @change="e => updatePlugin((e.target as HTMLSelectElement).value)"
            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="" disabled>-- 请选择插件 --</option>
            <option v-for="plugin in plugins" :key="plugin.id" :value="plugin.id.toString()">{{ plugin.name }}</option>
          </select>
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-1 flex items-center justify-between">
            输入变量 (Input)
            <span class="text-[10px] text-blue-500 font-normal bg-blue-50 px-1.5 py-0.5 rounded cursor-help" title="支持 Dify 变量语法">支持引用上游变量</span>
          </label>
          <textarea 
            :value="node.data.inputData"
            @input="e => updateData('inputData', (e.target as HTMLTextAreaElement).value)"
            rows="3"
            placeholder="例如: {{#start_node.query#}}"
            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
          ></textarea>
        </div>
      </template>

      <!-- Selector Node Specific -->
      <template v-if="node.type === 'selector'">
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-2">多分支条件配置 (Cases)</label>
          <div class="text-xs text-gray-500 mb-3">
            程序会从上到下依次执行表达式，返回 <code class="bg-gray-100 px-1 py-0.5 rounded text-gray-600">true</code> 的分支将被触发。可用变量：<code class="bg-gray-100 px-1 py-0.5 rounded text-gray-600">input</code>
          </div>
          
          <div class="space-y-3">
            <div v-for="(item, index) in (node.data.cases || [])" :key="index" class="bg-gray-50 p-3 rounded-lg border border-gray-200 relative">
              <button @click="removeSelectorCase(index)" class="absolute top-2 right-2 text-red-400 hover:text-red-600 p-1 bg-white rounded shadow-sm border border-gray-100" title="删除分支"><Trash2 size="14"/></button>
              
              <div class="mb-2 pr-8">
                <label class="block text-xs font-medium text-gray-600 mb-1">分支标签名 (Label)</label>
                <input 
                  type="text" 
                  v-model="item.label" 
                  @change="updateSelectorCase"
                  placeholder="如: 类型A"
                  class="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">条件表达式 (JS Code)</label>
                <textarea 
                  v-model="item.condition"
                  @change="updateSelectorCase"
                  rows="2"
                  placeholder="return input.status === 'success'"
                  class="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono bg-white"
                ></textarea>
              </div>
            </div>
            
            <button @click="addSelectorCase" class="w-full py-2 border border-dashed border-indigo-300 rounded-lg text-xs text-indigo-600 hover:bg-indigo-50 font-medium flex items-center justify-center gap-1 transition-colors">
              + 添加判断分支
            </button>
            
            <!-- Default Else branch hint -->
            <div class="bg-zinc-50 border border-zinc-200 p-2.5 rounded-lg text-xs text-zinc-500 flex items-center gap-2">
              <span class="font-bold text-zinc-700 bg-zinc-200 px-1.5 py-0.5 rounded">Else</span>
              所有条件都不满足时，将走默认兜底分支。
            </div>
          </div>
        </div>
      </template>

      <!-- Node Output Reference Hint (At the bottom) -->
      <div v-if="node.type !== 'end'" class="mt-6 pt-4 border-t border-gray-200">
        <label class="block text-sm font-medium text-gray-700 mb-2">节点输出引用</label>
        <div class="bg-indigo-50 border border-indigo-100 rounded-md p-3">
          <p class="text-[11px] text-indigo-700 mb-2">下游节点如需使用此节点结果，可填写以下变量引用：</p>
          <div class="flex items-center justify-between bg-white px-2 py-1.5 rounded border border-indigo-200">
            <code class="text-xs text-indigo-600 font-mono select-all" v-text="'{{#' + node.id + '.' + (node.type === 'start' ? 'query' : 'text') + '#}}'"></code>
          </div>
        </div>
      </div>

    </div>
  </aside>
  <aside v-else class="w-80 flex items-center justify-center text-gray-400 p-8 text-center z-10">
    点击画布上的节点以查看配置参数
  </aside>
</template>
