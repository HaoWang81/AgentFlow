import { initAgentMemoryDir, readCoreMemory, updateCoreMemory, searchArchivalMemory, appendDailyLog, memoriesRoot } from './memory_manager'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'
import { app } from 'electron'
import { createRequire } from 'module'

const _require = createRequire(import.meta.url)

const execAsync = promisify(exec)

function cosineSimilarity(vecA: number[], vecB: number[]) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

let localEmbeddingPipeline: any = null;
async function getLocalEmbeddings(texts: string[]) {
  if (!localEmbeddingPipeline) {
    const { pipeline, env } = await import('@xenova/transformers');
    env.remoteHost = 'https://hf-mirror.com/';
    localEmbeddingPipeline = await pipeline('feature-extraction', 'Xenova/bge-base-zh-v1.5');
  }
  const results = [];
  for (const text of texts) {
    const output = await localEmbeddingPipeline(text, { pooling: 'mean', normalize: true });
    results.push(Array.from(output.data));
  }
  return results;
}

async function getDirSnapshot(dirPath: string): Promise<Record<string, number>> {
  const snapshot: Record<string, number> = {}
  async function walk(currentDir: string) {
    try {
      const entries = await fs.promises.readdir(currentDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name === 'logs' || entry.name === 'MEMORY.md') continue
        const fullPath = path.join(currentDir, entry.name)
        if (entry.isDirectory()) {
          await walk(fullPath)
        } else {
          const stat = await fs.promises.stat(fullPath)
          snapshot[fullPath] = stat.mtimeMs
        }
      }
    } catch(e) {}
  }
  await walk(dirPath)
  return snapshot
}

export interface AgentExecuteOptions {
  sessionId?: string;
  onEvent?: (type: string, payload?: any) => void;
}

export async function executeAgent(agentId: string, messages: any[], db: any, options: AgentExecuteOptions = {}) {
  const { sessionId, onEvent = () => {} } = options;
  let finalAssistantMessageContent = '';
  
  const emit = (type: string, payload?: any) => onEvent(type, payload);

  try {
    const agent = await db.get(`SELECT * FROM agents WHERE id = ?`, agentId)
    if (!agent) throw new Error('Agent not found')
    
    let llmConfig: any = {}
    if (typeof agent.llm_config === 'string') {
      try { llmConfig = JSON.parse(agent.llm_config) } catch(e) {}
    }
    
    const model = await db.get(`SELECT * FROM models WHERE model_name = ?`, agent.model_name)
    if (!model) throw new Error(`Model ${agent.model_name} not found in database`)

    const { ChatOpenAI } = await import('@langchain/openai')
    const { HumanMessage, SystemMessage, AIMessage, ToolMessage } = await import('@langchain/core/messages')

    let advancedConfig: any = {}
    if (typeof model.advanced_config === 'string') {
      try { advancedConfig = JSON.parse(model.advanced_config) } catch(e) {}
    }

    const chat = new ChatOpenAI({
      modelName: model.model_name,
      apiKey: model.api_key || 'sk-empty-placeholder',
      temperature: llmConfig.temperature ?? 0.7,
      topP: llmConfig.top_p ?? 1.0,
      maxTokens: llmConfig.max_tokens ?? 16384,
      configuration: {
        baseURL: model.base_url || undefined,
        defaultHeaders: advancedConfig.headers || undefined
      }
    })

    const { agentDir } = await initAgentMemoryDir(agentId, sessionId)
    let finalSystemPrompt = agent.system_prompt || ''
    
    // --- Load Skills ---
    const skillIds = JSON.parse(agent.skills || '[]')
    const skillDocs: string[] = []
    for (const skillObj of skillIds) {
       const id = typeof skillObj === 'object' ? skillObj.id : skillObj
       const sDb = await db.get(`SELECT * FROM skills WHERE id = ?`, id)
       if (sDb) {
         skillDocs.push(`\n【技能：${sDb.name}】\n${sDb.content}`)
         if (sDb.files) {
           try {
             const files = JSON.parse(sDb.files)
             const skillDir = path.join(agentDir, 'skills', sDb.name.replace(/[^a-zA-Z0-9_-]/g, '_'))
             await fs.promises.mkdir(skillDir, { recursive: true })
             for (const file of files) {
               const filePath = path.join(skillDir, file.path)
               await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
               await fs.promises.writeFile(filePath, file.content, 'utf-8')
             }
             skillDocs.push(`\n*(提示: 该技能的附属文件已同步至你的本地目录: ${skillDir}，你可直接访问和执行)*`)
           } catch (err) {
             console.error(`Failed to sync files for skill ${sDb.name}`, err)
           }
         }
       }
    }
    if (skillDocs.length > 0) {
       finalSystemPrompt += '\n\n【您已被装配以下专业技能知识】\n' + skillDocs.join('\n')
    }

    // --- Inject Core Memory ---
    if (agent.memory_enabled) {
      const coreMem = await readCoreMemory(agentId)
      if (coreMem) {
        finalSystemPrompt += '\n\n【核心记忆 (Core Memory)】\n以下是您已经持久化记录的长期事实和用户偏好，请在回复时优先参考：\n' + coreMem
      }
    }

    const langMessages: any[] = []
    if (finalSystemPrompt) {
      langMessages.push(new SystemMessage(finalSystemPrompt))
    }
    for (const m of messages) {
      if (m.role === 'user') langMessages.push(new HumanMessage({ content: m.content }))
      else if (m.role === 'assistant') langMessages.push(new AIMessage({ content: m.content }))
    }

    const userMessageContent = messages[messages.length - 1]?.content || ''

    // --- Bind Tools ---
    const memoryTools = [
      {
        type: 'function',
        function: {
          name: 'update_core_memory',
          description: '更新或追加核心记忆。当你发现用户提到重要的事实、偏好、人物设定等值得长期保存的信息时，调用此工具。',
          parameters: { type: 'object', properties: { fact: { type: 'string', description: '需要保存的具体事实或设定' } }, required: ['fact'] }
        }
      },
      {
        type: 'function',
        function: {
          name: 'search_archival_memory',
          description: '检索历史对话日志。你可以按关键字模糊搜索，或者直接请求获取最早/最新的记录。',
          parameters: {
            type: 'object',
            properties: { 
              query: { type: 'string', description: '检索关键词。如果是按意图查找最早/最新记录，可留空。' },
              mode: { type: 'string', enum: ['search', 'first', 'last'], description: '检索模式。' }
            },
            required: ['mode']
          }
        }
      }
    ]
    
    const dynamicTools: any[] = [
      {
        type: 'function',
        function: {
          name: 'list_directory',
          description: '列出当前智能体专属工作目录下的文件和文件夹。只需要传入相对路径即可（留空或 \'.\' 表示根目录）。',
          parameters: { type: 'object', properties: { dir_path: { type: 'string', description: '相对路径' } }, required: ['dir_path'] }
        },
        __exec: async (args: any) => {
          if (typeof args === 'string') try { args = JSON.parse(args) } catch(e) {}
          try {
            const targetPath = path.resolve(agentDir, args.dir_path || '.')
            if (!targetPath.startsWith(agentDir)) throw new Error('Access denied: out of bounds')
            const files = fs.readdirSync(targetPath, { withFileTypes: true })
            return JSON.stringify(files.map(f => ({ name: f.name, isDirectory: f.isDirectory() })))
          } catch(e: any) { return `Error: ${e.message}` }
        }
      },
      {
        type: 'function',
        function: {
          name: 'read_file',
          description: '读取当前智能体专属工作目录下的文件内容。',
          parameters: { type: 'object', properties: { file_path: { type: 'string', description: '文件的相对路径' } }, required: ['file_path'] }
        },
        __exec: async (args: any) => {
          if (typeof args === 'string') try { args = JSON.parse(args) } catch(e) {}
          try {
            const targetPath = path.resolve(agentDir, args.file_path)
            if (!targetPath.startsWith(agentDir)) throw new Error('Access denied: out of bounds')
            return fs.readFileSync(targetPath, 'utf-8')
          } catch(e: any) { return `Error: ${e.message}` }
        }
      },
      {
        type: 'function',
        function: {
          name: 'write_file',
          description: '将完整内容直接写入文件。建议大段代码在普通回复中使用Markdown块，然后在此工具中省略content。',
          parameters: { type: 'object', properties: { file_path: { type: 'string', description: '相对路径' }, content: { type: 'string', description: '内容' } }, required: ['file_path'] }
        },
        __exec: async (args: any, aiMsgChunk?: any) => {
          if (typeof args === 'string') {
            try { args = JSON.parse(args) } catch(e: any) { return `Error: JSON error` }
          }
          if (!args.content && args.content !== '') {
            const msgContent = typeof aiMsgChunk?.content === 'string' ? aiMsgChunk.content : ''
            const codeBlocks = [...msgContent.matchAll(/```[^\n]*\n([\s\S]*?)```/g)]
            if (codeBlocks.length > 0) {
              args.content = codeBlocks[codeBlocks.length - 1][1].trim()
            } else {
              return `Error: 找不到正文中的Markdown代码块，且参数为空。`
            }
          }
          if (args.content === '') return 'Error: content 不能为空。'
          try { 
            const targetPath = path.resolve(agentDir, args.file_path)
            if (!targetPath.startsWith(agentDir)) throw new Error('Access denied: out of bounds')
            fs.mkdirSync(path.dirname(targetPath), { recursive: true })
            fs.writeFileSync(targetPath, args.content, 'utf-8')
            return `Success: Wrote ${args.content.length} characters to ${args.file_path}`
          } catch(e: any) { return `Error: ${e.message}` }
        }
      },
      {
        type: 'function',
        function: {
          name: 'execute_command',
          description: '在当前智能体的专属会话目录下执行 Shell 命令。注意：执行 Python 必须在名为 `aistar` 的虚环境中执行。',
          parameters: { type: 'object', properties: { command: { type: 'string', description: '要执行的Shell命令' } }, required: ['command'] }
        },
        __exec: async (args: any) => {
          if (typeof args === 'string') try { args = JSON.parse(args) } catch(e) {}
          try {
            let pyEnvPath = path.join(app.isPackaged ? process.resourcesPath : path.resolve(process.cwd(), 'resources'), 'python-env', 'python');
            const isWin = os.platform() === 'win32';
            const pyBinPath = isWin ? pyEnvPath : path.join(pyEnvPath, 'bin');
            
            const customEnv = {
              ...process.env,
              PATH: fs.existsSync(pyBinPath) ? `${pyBinPath}${path.delimiter}${process.env.PATH}` : process.env.PATH
            };
            
            const { stdout, stderr } = await execAsync(args.command, { cwd: agentDir, env: customEnv })
            return JSON.stringify({ stdout, stderr })
          } catch(e: any) { return `Error executing command: ${e.message}` }
        }
      }
    ]
    
    // Load Custom User Tools
    const toolIds = JSON.parse(agent.tools || '[]')
    for (const tid of toolIds) {
      const tDb = await db.get(`SELECT * FROM tools WHERE id = ?`, tid)
      if (tDb) {
        dynamicTools.push({
          type: 'function',
          function: {
            name: `tool_${tDb.id}_${tDb.name.replace(/[^a-zA-Z0-9_-]/g, '') || 'custom_tool'}`,
            description: tDb.description || `Tool: ${tDb.name}`,
            parameters: typeof tDb.parameters === 'string' ? JSON.parse(tDb.parameters) : tDb.parameters
          },
          __exec: async (args: any) => {
            const func = new Function('args', 'require', `return (async () => { ${tDb.code} })()`)
            return await func(args, _require)
          }
        })
      }
    }

    // Load Subagents
    const subAgentIds = JSON.parse(agent.sub_agents || '[]')
    for (const sid of subAgentIds) {
      if (sid === agentId || sid.toString() === agentId.toString()) continue; // 防死循环，禁止自我委托
      const subDb = await db.get(`SELECT * FROM agents WHERE id = ?`, sid)
      if (subDb) {
        dynamicTools.push({
          type: 'function',
          function: {
            name: `delegate_to_agent_${subDb.id}`,
            description: `委托子智能体 [${subDb.name}] 处理下级任务。${subDb.description || ''}`,
            parameters: { type: 'object', properties: { task: { type: 'string', description: '清晰描述需要这个智能体完成的具体任务和要求' } }, required: ['task'] }
          },
          __exec: async (args: any) => {
            const taskDesc = typeof args === 'string' ? (JSON.parse(args).task || args) : args.task;
            try {
               emit('TEXT_MESSAGE_CONTENT', { delta: `\n> 🔀 [委托调度] 正在唤醒子智能体 "${subDb.name}" 执行任务...\n` });
               const res = await executeAgent(
                 subDb.id,
                 [{ role: 'user', content: taskDesc }],
                 db,
                 {
                   sessionId: options.sessionId,
                   onEvent: () => {} // 隐藏子智能体的逐步输出
                 }
               )
               emit('TEXT_MESSAGE_CONTENT', { delta: `\n> ↩️ [委托返回] 子智能体 "${subDb.name}" 任务完成。\n` });
               return `[子智能体 ${subDb.name} 最终输出]:\n${res}`
            } catch(e: any) {
               return `[委托调用子智能体 ${subDb.name} 失败]: ${e.message}`
            }
          }
        })
      }
    }

    // Load Knowledge Bases
    const kbIds = JSON.parse(agent.knowledge_bases || '[]')
    for (const kid of kbIds) {
      const kDb = await db.get(`SELECT * FROM knowledge_bases WHERE id = ?`, kid)
      if (kDb) {
        dynamicTools.push({
          type: 'function',
          function: {
            name: `query_kb_${kDb.id}_${kDb.name.replace(/[^a-zA-Z0-9_-]/g, '') || 'rag'}`,
            description: `从知识库【${kDb.name}】中检索信息。${kDb.description || ''}`,
            parameters: { type: 'object', properties: { query: { type: 'string', description: '检索查询词' } }, required: ['query'] }
          },
          __exec: async (args: any) => {
            const config = typeof kDb.config === 'string' ? JSON.parse(kDb.config) : (kDb.config || {})
            if (config.type === 'remote') {
              const fetchOpts: any = { method: config.method || 'GET', headers: config.headers ? JSON.parse(config.headers) : {} }
              if (config.method !== 'GET' && config.body) {
                const safeQuery = args.query ? JSON.stringify(args.query).slice(1, -1) : ''
                fetchOpts.body = config.body.replace(/\{\{query\}\}/g, safeQuery)
                fetchOpts.headers['Content-Type'] = fetchOpts.headers['Content-Type'] || 'application/json'
              }
              let fetchUrl = config.url
              if (config.method === 'GET' && args.query) {
                fetchUrl += (fetchUrl.includes('?') ? '&' : '?') + `query=${encodeURIComponent(args.query)}`
              }
              const fetchRes = await fetch(fetchUrl, fetchOpts)
              if (!fetchRes.ok) return `Retrieval Failed: HTTP ${fetchRes.status}`
              const data = await fetchRes.json()
              let extracted = data
              if (config.json_path && config.json_path.startsWith('$.')) {
                const parts = config.json_path.substring(2).split('.').filter(Boolean)
                for (const part of parts) {
                  if (extracted && extracted[part] !== undefined) extracted = extracted[part]
                }
              }
              if (Array.isArray(extracted) && config.result_text_field) {
                extracted = extracted.map((item: any) => {
                  if (typeof item === 'object' && item !== null && item[config.result_text_field] !== undefined) return item[config.result_text_field]
                  return item
                }).filter(Boolean)
              }
              return typeof extracted === 'string' ? extracted : JSON.stringify(extracted)
            } else if (config.type === 'local') {
              try {
                const bgeQueryPrefix = "为这个句子生成表示以用于检索相关文章："
                const vectors = await getLocalEmbeddings([bgeQueryPrefix + (args.query || '')])
                const queryVector = vectors[0]

                const chunks = await db.all(`SELECT file_name, chunk_text, embedding FROM kb_chunks WHERE kb_id = ?`, kDb.id)
                if (!chunks || chunks.length === 0) return '知识库为空。'

                const scoredChunks = chunks.map((c: any) => {
                  let vec = []
                  try { vec = JSON.parse(c.embedding) } catch(e) { return null }
                  if (!vec || !Array.isArray(vec) || vec.length === 0) return null
                  const score = cosineSimilarity(queryVector, vec)
                  return { score, text: c.chunk_text, file: c.file_name }
                }).filter((c: any) => c !== null)

                scoredChunks.sort((a: any, b: any) => b.score - a.score)
                const topChunks = scoredChunks.slice(0, 5)

                if (topChunks.length === 0) return '未检索到相关内容。'
                return topChunks.map((tc: any) => `[来源文件: ${tc.file} (相关度: ${(tc.score*100).toFixed(1)}%)]\n${tc.text}`).join('\n\n')
              } catch (e: any) {
                return `检索知识库出错: ${e.message}`
              }
            }
            return '未知的知识库类型配置'
          }
        })
      }
    }

    // Load MCP Servers
    const mcpIds = JSON.parse(agent.mcp_servers || '[]')
    const activeMcpClients: any[] = []
    for (const mid of mcpIds) {
      const mDb = await db.get(`SELECT * FROM mcp_servers WHERE id = ?`, mid)
      if (!mDb) continue
      const config = typeof mDb.config === 'string' ? JSON.parse(mDb.config) : (mDb.config || {})
      
      let transport: any
      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
      if (config.type === 'sse') {
         const { SSEClientTransport } = await import('@modelcontextprotocol/sdk/client/sse.js')
         transport = new SSEClientTransport(new URL(mDb.url))
      } else {
         const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js')
         transport = new StdioClientTransport({
           command: config.command,
           args: config.args || [],
           env: { ...process.env, ...(config.env || {}) }
         })
      }
      const client = new Client({ name: 'Agent', version: '1.0' }, { capabilities: { tools: {} } })
      try {
        await client.connect(transport)
        const mcpToolsRes = await client.listTools()
        activeMcpClients.push({ client, transport })
        for (const mt of mcpToolsRes.tools) {
          dynamicTools.push({
            type: 'function',
            function: {
              name: `mcp_${mid}_${mt.name.replace(/[^a-zA-Z0-9_-]/g, '') || 'ext'}`,
              description: `[MCP: ${mDb.name}] ${mt.description || ''}`,
              parameters: mt.inputSchema
            },
            __exec: async (args: any) => {
              const result = await client.callTool({ name: mt.name, arguments: args })
              return JSON.stringify(result.content)
            }
          })
        }
      } catch(e) {
        console.error(`Failed to connect to MCP ${mDb.name}`, e)
      }
    }
    
    const allToolsSchema = agent.memory_enabled 
        ? [...memoryTools, ...dynamicTools.map(dt => ({ type: dt.type, function: dt.function }))]
        : dynamicTools.map(dt => ({ type: dt.type, function: dt.function }))
        
    const sysMsgIndex = langMessages.findIndex(m => m instanceof SystemMessage)
    if (sysMsgIndex >= 0 && allToolsSchema.length > 0) {
      let prompt = langMessages[sysMsgIndex].content;
      const extLines = allToolsSchema.map(t => `- **${t.function.name}**: ${t.function.description}`)
      prompt += '\n\n【AgentScope Capabilities & Extensions】\n您被装配了以下专属能力与扩展工具。请在需要解答事实、获取最新数据或执行复杂任务时，**务必主动**调用这些工具获取结果，不要仅凭记忆猜测：\n' + extLines.join('\n');
      langMessages[sysMsgIndex] = new SystemMessage(prompt);
    }

    const chatWithTools = allToolsSchema.length > 0 ? chat.bindTools(allToolsSchema) : chat

    emit('TEXT_MESSAGE_START', { messageId: 'msg_' + Date.now() })

    let currentMessages = [...langMessages]
    let loopCount = 0
    const MAX_LOOPS = llmConfig.max_loops ?? 10

    while (loopCount < MAX_LOOPS) {
      loopCount++
      const stream = await chatWithTools.stream(currentMessages)
      
      let aiContent = ''
      let aiMsgChunk: any = null
      let currentToolIndex = -1

      for await (const chunk of stream) {
        if (!aiMsgChunk) aiMsgChunk = chunk
        else aiMsgChunk = aiMsgChunk.concat(chunk)

        if (chunk.content) {
          aiContent += chunk.content
          emit('TEXT_MESSAGE_CONTENT', { delta: chunk.content })
        }

        if (chunk.tool_call_chunks && chunk.tool_call_chunks.length > 0) {
          for (const tcc of chunk.tool_call_chunks) {
            if (tcc.index !== currentToolIndex) {
              if (currentToolIndex !== -1) emit('TOOL_CALL_END')
              currentToolIndex = tcc.index
              emit('TOOL_CALL_START', { tool_name: tcc.name || 'unknown' })
            }
            if (tcc.args) emit('TOOL_CALL_CHUNK', { delta: tcc.args })
          }
        }
      }

      if (currentToolIndex !== -1) emit('TOOL_CALL_END')

      currentMessages.push(aiMsgChunk)
      finalAssistantMessageContent += aiContent

      if (aiMsgChunk.tool_calls && aiMsgChunk.tool_calls.length > 0) {
        for (const tc of aiMsgChunk.tool_calls) {
          let toolResult = ''
          if (tc.name === 'update_core_memory') {
            const fact = tc.args?.fact || ''
            const success = await updateCoreMemory(agentId, fact)
            toolResult = success ? '写入核心记忆成功' : '写入失败'
          } else if (tc.name === 'search_archival_memory') {
            const query = tc.args?.query || ''
            const mode = tc.args?.mode || 'search'
            toolResult = await searchArchivalMemory(agentId, query, mode)
          } else {
            const matchedDynamicTool = dynamicTools.find(dt => dt.function.name === tc.name)
            if (matchedDynamicTool) {
               try {
                  const beforeSnapshot = await getDirSnapshot(agentDir)
                  const output = await matchedDynamicTool.__exec(tc.args, aiMsgChunk)
                  const afterSnapshot = await getDirSnapshot(agentDir)
                  
                  for (const [filePath, mtimeMs] of Object.entries(afterSnapshot)) {
                    if (!beforeSnapshot[filePath] || beforeSnapshot[filePath] !== mtimeMs) {
                      const fileName = path.basename(filePath)
                      const relativePath = path.relative(memoriesRoot, filePath).split(path.sep).join('/')
                      emit('FILE_ARTIFACT', { file_name: fileName, file_path: `/memories/${relativePath}` })
                    }
                  }
                  toolResult = typeof output === 'string' ? output : JSON.stringify(output)
               } catch(err: any) {
                  toolResult = `Error executing tool: ${err.message}`
               }
            } else {
               toolResult = 'Unknown tool'
            }
          }
          currentMessages.push(new ToolMessage({ tool_call_id: tc.id, content: toolResult, name: tc.name }))
          emit('TOOL_CALL_RESULT', { tool_name: tc.name, result: toolResult })
        }
        continue 
      } else {
        break
      }
    }

    if (agent.memory_enabled && userMessageContent) {
      await appendDailyLog(agentId, 'user', userMessageContent)
      await appendDailyLog(agentId, 'assistant', finalAssistantMessageContent)
    }

    for (const { transport } of activeMcpClients) {
      try { await transport.close() } catch(e) {}
    }

    emit('TEXT_MESSAGE_END')
    return finalAssistantMessageContent;

  } catch (err: any) {
    console.error('Agent execution error:', err)
    throw err
  }
}
