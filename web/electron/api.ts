import express from 'express'
import cors from 'cors'
import { getDb } from './database'
import { compileGraph } from './graph_engine'
import { executeKnowledgeBaseQuery } from './kb_runner'
import { initAgentMemoryDir, readCoreMemory, updateCoreMemory, searchArchivalMemory, appendDailyLog, deleteAgentMemoryDir, clearAllMemories, memoriesRoot, loadShortTermMemory, saveShortTermMemory, listAgentLogs, getAgentLog } from './memory_manager'
import os from 'os'
import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { app } from 'electron'
import multer from 'multer'
import AdmZip from 'adm-zip'
import { createRequire } from 'module'

const _require = createRequire(import.meta.url)

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

// 本地模型特征提取单例
let localEmbeddingPipeline: any = null;
async function getLocalEmbeddings(texts: string[]) {
  if (!localEmbeddingPipeline) {
    const { pipeline, env } = await import('@xenova/transformers');
    // 使用国内镜像加速下载，避免 Unauthorized 或 Connection Timeout 错误
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

const execAsync = promisify(exec)
const upload = multer({ dest: os.tmpdir() })

function parseSkillMarkdown(content: string, fallbackName: string) {
  let name = fallbackName
  let description = 'Imported Skill'
  
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (frontmatterMatch) {
    const yaml = frontmatterMatch[1]
    const nameMatch = yaml.match(/^name:\s*(.+)$/m)
    if (nameMatch) name = nameMatch[1].trim()
    
    const descMatch = yaml.match(/^description:\s*(.+)$/m)
    if (descMatch) description = descMatch[1].trim()
  } else {
    // Fallback if no frontmatter
    const lines = content.split('\\n')
    name = lines.find(l => l.startsWith('# '))?.replace('# ', '').trim() || fallbackName
    description = lines.find(l => l.trim().length > 0 && !l.startsWith('#'))?.trim() || 'Imported Skill'
  }
  
  return { name, description, content }
}

function extractFilesFromZip(zip: AdmZip) {
  const files: Array<{path: string, content: string}> = []
  const entries = zip.getEntries()
  for (const entry of entries) {
    if (entry.isDirectory || entry.entryName.includes('__MACOSX')) continue
    try {
      const content = zip.readAsText(entry)
      files.push({ path: entry.entryName, content })
    } catch(e) {}
  }
  return files
}

function readDirRecursively(dir: string, baseDir: string = dir) {
  const files: Array<{path: string, content: string}> = []
  if (!fs.existsSync(dir)) return files
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name.startsWith('__MACOSX')) continue
    const fullPath = path.join(dir, entry.name)
    const relativePath = path.relative(baseDir, fullPath).replace(/\\\\/g, '/')
    if (entry.isDirectory()) {
      files.push(...readDirRecursively(fullPath, baseDir))
    } else {
      try {
        const content = fs.readFileSync(fullPath, 'utf-8')
        // Simple heuristic: skip if it's too large or likely binary (contains null bytes)
        if (content.length < 5 * 1024 * 1024 && !content.includes('\\0')) {
          files.push({ path: relativePath, content })
        }
      } catch (e) {}
    }
  }
  return files
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

export function startApiServer(): Promise<any> {
  return new Promise((resolve) => {

const app = express()
    app.use(cors())
    app.use(express.json({ limit: '50mb' }))
    app.use(express.urlencoded({ limit: '50mb', extended: true }))
    app.use('/memories', express.static(memoriesRoot))
    // --- Dynamic CRUD Helper ---
    function mountCrud(table: string, jsonFields: string[] = []) {
      const parseRow = (row: any) => {
        if (!row) return null
        const obj = { ...row }
        for (const field of jsonFields) {
          if (typeof obj[field] === 'string') {
            try { obj[field] = JSON.parse(obj[field]) } catch(e) {}
          }
        }
        return obj
      }

      app.get(`/api/${table}`, async (req, res) => {
        const db = await getDb()
        const rows = await db.all(`SELECT * FROM ${table} ORDER BY id DESC`)
        res.json(rows.map(parseRow))
      })

      app.post(`/api/${table}`, async (req, res) => {
        try {
          const db = await getDb()
          const tableInfo = await db.all(`PRAGMA table_info(${table})`)
          const validColumns = new Set(tableInfo.map((c: any) => c.name))
          
          const data = req.body
          const fields = []
          const values = []
          const placeholders = []
          for (const [k, v] of Object.entries(data)) {
            if (k === 'id' || k === 'created_at' || k === 'updated_at' || !validColumns.has(k)) continue
            fields.push(k)
            placeholders.push('?')
            values.push(typeof v === 'object' ? JSON.stringify(v) : (typeof v === 'boolean' ? (v ? 1 : 0) : v))
          }
          if (fields.length === 0) return res.status(400).json({ error: 'No valid data provided' })
          const result = await db.run(`INSERT INTO ${table} (${fields.join(', ')}) VALUES (${placeholders.join(', ')})`, ...values)
          const row = await db.get(`SELECT * FROM ${table} WHERE id = ?`, result.lastID)
          
          if (table === 'agents') {
            const { agentScheduler } = await import('./scheduler')
            agentScheduler.scheduleAgent(row)
          }
          
          res.json(parseRow(row))
        } catch (e: any) {
          res.status(500).json({ error: e.message })
        }
      })

      app.get(`/api/${table}/:id`, async (req, res) => {
        try {
          const db = await getDb()
          const row = await db.get(`SELECT * FROM ${table} WHERE id = ?`, req.params.id)
          if (!row) return res.status(404).json({ detail: 'Not found' })
          res.json(parseRow(row))
        } catch (e: any) {
          res.status(500).json({ error: e.message })
        }
      })

      app.put(`/api/${table}/:id`, async (req, res) => {
        try {
          const db = await getDb()
          const tableInfo = await db.all(`PRAGMA table_info(${table})`)
          const validColumns = new Set(tableInfo.map((c: any) => c.name))

          const updates = req.body
          const fields: string[] = []
          const values: any[] = []
          for (const [k, v] of Object.entries(updates)) {
            if (k === 'id' || k === 'created_at' || k === 'updated_at' || !validColumns.has(k)) continue
            fields.push(`${k} = ?`)
            values.push(typeof v === 'object' ? JSON.stringify(v) : (typeof v === 'boolean' ? (v ? 1 : 0) : v))
          }
          if (fields.length > 0) {
            values.push(req.params.id)
            await db.run(`UPDATE ${table} SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, ...values)
          }
          const row = await db.get(`SELECT * FROM ${table} WHERE id = ?`, req.params.id)
          
          if (table === 'agents') {
            const { agentScheduler } = await import('./scheduler')
            agentScheduler.scheduleAgent(row)
          }

          res.json(parseRow(row))
        } catch (e: any) {
          res.status(500).json({ error: e.message })
        }
      })

      app.delete(`/api/${table}/:id`, async (req, res) => {
        const db = await getDb()
        await db.run(`DELETE FROM ${table} WHERE id = ?`, req.params.id)
        
        if (table === 'agents') {
          const { agentScheduler } = await import('./scheduler')
          agentScheduler.unscheduleAgent(req.params.id)
        }

        res.json({ message: 'Deleted' })
      })
    }

    // --- Custom Agent Deletion (Wipe Memory) ---
    app.delete('/api/agents/:id', async (req, res) => {
      try {
        const db = await getDb()
        await db.run('DELETE FROM agents WHERE id = ?', req.params.id)
        await deleteAgentMemoryDir(req.params.id) // 彻底清除本地记忆存储
        res.json({ message: 'Deleted' })
      } catch (err: any) {
        res.status(500).json({ error: err.message })
      }
    })

    // --- Custom Models Intercept for is_default ---
    app.post('/api/models', async (req, res, next) => {
      if (req.body.is_default) {
        const db = await getDb()
        await db.run('UPDATE models SET is_default = 0')
      }
      next()
    })

    app.put('/api/models/:id', async (req, res, next) => {
      if (req.body.is_default) {
        const db = await getDb()
        await db.run('UPDATE models SET is_default = 0')
      }
      next()
    })

    // --- Mount Core Modules ---
    mountCrud('workflows', ['nodes', 'edges'])
    mountCrud('agents', ['llm_config', 'tools', 'mcp_servers', 'plugins', 'knowledge_bases', 'skills', 'cron_config'])
    mountCrud('models', ['default_config', 'advanced_config'])
    mountCrud('skills', [])
    mountCrud('knowledge_bases', ['config'])
    mountCrud('mcp_servers', ['config'])
    mountCrud('tools', ['parameters'])

    // ==========================================
    // Agent Runs History API
    // ==========================================
    app.get('/api/agents/:id/runs', async (req, res) => {
      try {
        const db = await getDb()
        const rows = await db.all('SELECT * FROM agent_runs WHERE agent_id = ? ORDER BY id DESC LIMIT 100', req.params.id)
        res.json(rows)
      } catch (e: any) {
        res.status(500).json({ error: e.message })
      }
    })

    app.delete('/api/agents/:id/runs', async (req, res) => {
      try {
        const db = await getDb()
        await db.run('DELETE FROM agent_runs WHERE agent_id = ?', req.params.id)
        res.json({ success: true })
      } catch (e: any) {
        res.status(500).json({ error: e.message })
      }
    })

    // --- Agent Import & Export Endpoints ---
    app.get('/api/agents/:id/export', async (req, res) => {
      try {
        const db = await getDb()
        let step = "fetch_agent";
        let currentParam = req.params.id;
        
        const agent = await db.get('SELECT * FROM agents WHERE id = ?', req.params.id)
        if (!agent) return res.status(404).json({ error: 'Agent not found' })

        const parseJSON = (str: any) => { try { return typeof str === 'string' ? JSON.parse(str) : (str || []) } catch(e) { return [] } }
        
        agent.llm_config = parseJSON(agent.llm_config)
        agent.tools = parseJSON(agent.tools)
        agent.mcp_servers = parseJSON(agent.mcp_servers)
        agent.knowledge_bases = parseJSON(agent.knowledge_bases)
        agent.skills = parseJSON(agent.skills)

        const dependencies: any = { tools: [], skills: [], mcp_servers: [], knowledge_bases: [] }

        try {
          step = "fetch_tools";
          for (const t of agent.tools) {
            currentParam = t;
            const tid = typeof t === 'object' ? t.id : t;
            if (!tid) continue;
            const tDb = await db.get('SELECT * FROM tools WHERE id = ?', tid)
            if (tDb) dependencies.tools.push(tDb)
          }
          
          step = "fetch_skills";
          for (const s of agent.skills) {
            currentParam = s;
            const sid = typeof s === 'object' ? s.id : s;
            if (!sid) continue;
            const sDb = await db.get('SELECT * FROM skills WHERE id = ?', sid)
            if (sDb) dependencies.skills.push(sDb)
          }
          
          step = "fetch_mcp";
          for (const m of agent.mcp_servers) {
            currentParam = m;
            const mid = typeof m === 'object' ? m.id : m;
            if (!mid) continue;
            const mDb = await db.get('SELECT * FROM mcp_servers WHERE id = ?', mid)
            if (mDb) dependencies.mcp_servers.push(mDb)
          }
          
          step = "fetch_kb";
          for (const k of agent.knowledge_bases) {
            currentParam = k;
            const kid = typeof k === 'object' ? k.id : k;
            if (!kid) continue;
            const kDb = await db.get('SELECT * FROM knowledge_bases WHERE id = ?', kid)
            if (kDb) {
              const config = parseJSON(kDb.config)
              const safeConfig = { type: config.type || 'local' }
              dependencies.knowledge_bases.push({ ...kDb, config: JSON.stringify(safeConfig) })
            }
          }
        } catch (innerError: any) {
          throw new Error(`Error at step ${step} with param ${JSON.stringify(currentParam)}: ${innerError.message}`);
        }

        res.json({ agent, dependencies })
      } catch (e: any) {
        res.status(500).json({ error: e.message, stack: e.stack })
      }
    })

    app.post('/api/agents/import', async (req, res) => {
      try {
        const { agent, dependencies } = req.body
        if (!agent || !dependencies) return res.status(400).json({ error: 'Invalid payload' })

        const db = await getDb()

        // 辅助函数：根据 name 查找依赖或插入新依赖
        const resolveDependency = async (table: string, items: any[]) => {
          const resolvedIds = []
          for (const item of items) {
            const existing = await db.get(`SELECT id FROM ${table} WHERE name = ?`, item.name)
            if (existing) {
              resolvedIds.push(existing.id)
            } else {
              const { id, created_at, updated_at, ...fields } = item
              const keys = Object.keys(fields)
              const values = Object.values(fields)
              const placeholders = keys.map(() => '?').join(', ')
              const insertResult = await db.run(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`, ...values)
              resolvedIds.push(insertResult.lastID)
            }
          }
          return resolvedIds
        }

        const newToolIds = await resolveDependency('tools', dependencies.tools || [])
        const newSkillIds = await resolveDependency('skills', dependencies.skills || [])
        const newMcpIds = await resolveDependency('mcp_servers', dependencies.mcp_servers || [])
        const newKbIds = await resolveDependency('knowledge_bases', dependencies.knowledge_bases || [])

        agent.tools = newToolIds
        agent.skills = newSkillIds
        agent.mcp_servers = newMcpIds
        agent.knowledge_bases = newKbIds
        agent.name = `${agent.name} (导入)`

        const { id, created_at, updated_at, ...agentFields } = agent
        const keys = Object.keys(agentFields)
        const values = Object.values(agentFields).map(v => typeof v === 'object' ? JSON.stringify(v) : v)
        const placeholders = keys.map(() => '?').join(', ')

        const insertAgentResult = await db.run(`INSERT INTO agents (${keys.join(', ')}) VALUES (${placeholders})`, ...values)
        res.json({ id: insertAgentResult.lastID })
      } catch (e: any) {
        res.status(500).json({ error: e.message })
      }
    })

    // --- AG-UI Chat Stream Endpoint ---
    // --- Short Term History Endpoints ---
    app.get('/api/agents/:id/history', async (req, res) => {
      try {
        const history = await loadShortTermMemory(req.params.id)
        res.json(history)
      } catch (e: any) {
        res.status(500).json({ error: e.message })
      }
    })

    app.post('/api/agents/:id/history', async (req, res) => {
      try {
        const success = await saveShortTermMemory(req.params.id, req.body.messages || [])
        if (success) res.json({ success: true })
        else res.status(500).json({ error: 'Failed to save history' })
      } catch (e: any) {
        res.status(500).json({ error: e.message })
      }
    })

    app.delete('/api/agents/:id/memory', async (req, res) => {
      try {
        await deleteAgentMemoryDir(req.params.id)
        res.json({ success: true })
      } catch (e: any) {
        res.status(500).json({ error: e.message })
      }
    })

    // --- Archival Logs Endpoints ---
    app.get('/api/agents/:id/logs', async (req, res) => {
      try {
        const dates = await listAgentLogs(req.params.id)
        res.json(dates)
      } catch (e: any) {
        res.status(500).json({ error: e.message })
      }
    })

    app.get('/api/agents/:id/logs/:date', async (req, res) => {
      try {
        const content = await getAgentLog(req.params.id, req.params.date)
        res.send(content)
      } catch (e: any) {
        res.status(500).send('Error loading log')
      }
    })

    app.delete('/api/memory/clear-all', async (req, res) => {
      try {
        await clearAllMemories()
        res.json({ success: true })
      } catch (e: any) {
        res.status(500).json({ error: e.message })
      }
    })

    // --- Upload File for Agent ---
    app.post('/api/agents/:id/upload', upload.single('file'), async (req, res) => {
      try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
        const agentId = req.params.id
        const sessionId = req.body.sessionId || req.query.sessionId as string | undefined
        const { agentDir } = await initAgentMemoryDir(agentId, sessionId)
        
        const uploadsDir = path.join(agentDir, 'uploads')
        await fs.promises.mkdir(uploadsDir, { recursive: true })
        
        // 修复 multer 默认的文件名乱码问题：直接优先使用前端通过表单字段传来的 UTF-8 文件名
        let originalName = req.body.filename || req.file.originalname
        try {
          if (!req.body.filename && /[\\x80-\\xFF]/.test(originalName)) {
            originalName = Buffer.from(originalName, 'latin1').toString('utf8')
          }
        } catch(e) {}

        const safeName = originalName.replace(/[\\\\/]/g, '_')
        const finalPath = path.join(uploadsDir, Date.now() + '_' + safeName)
        
        await fs.promises.copyFile(req.file.path, finalPath)
        await fs.promises.unlink(req.file.path)
        
        const ext = path.extname(safeName).toLowerCase()
        let content = ''
        let type = 'file'
        let base64 = ''

        if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) {
          type = 'image'
          const buf = await fs.promises.readFile(finalPath)
          base64 = `data:image/${ext.replace('.', '')};base64,` + buf.toString('base64')
        } else if (ext === '.pdf') {
          try {
            const pdfParseModule = await import('pdf-parse')
            const pdfParse = pdfParseModule.default || pdfParseModule
            const buf = await fs.promises.readFile(finalPath)
            const data = await pdfParse(buf)
            content = data.text
            type = 'text'
          } catch(e) {
            type = 'binary'
            content = `[PDF 解析失败，已存入沙盒: ${finalPath}]`
          }
        } else if (['.xlsx', '.xls', '.csv'].includes(ext)) {
          try {
            const XLSXModule = await import('xlsx')
            const XLSX = XLSXModule.default || XLSXModule
            const workbook = XLSX.readFile(finalPath)
            let text = ''
            for (const sheetName of workbook.SheetNames) {
              const worksheet = workbook.Sheets[sheetName]
              text += `\n--- Sheet: ${sheetName} ---\n`
              text += XLSX.utils.sheet_to_csv(worksheet)
            }
            content = text
            type = 'text'
          } catch(e: any) {
            const buf = await fs.promises.readFile(finalPath)
            if (buf.length < 5 * 1024 * 1024 && !buf.includes(0)) {
               content = buf.toString('utf-8')
               type = 'text'
            } else {
               type = 'binary'
               content = `[Excel解析失败(${e.message})，已存入沙盒: ${finalPath}]`
            }
          }
        } else if (['.docx', '.pptx', '.doc', '.ppt'].includes(ext)) {
          try {
            const officeParserModule = await import('officeparser')
            const officeParser = officeParserModule.default || officeParserModule
            const ast = await officeParser.parseOffice(finalPath)
            content = typeof ast === 'string' ? ast : (ast.toText ? ast.toText() : String(ast))
            type = 'text'
          } catch(e) {
            type = 'binary'
            content = `[Office文档解析失败，已存入沙盒: ${finalPath}]`
          }
        } else {
          // 尝试按文本读取
          const buf = await fs.promises.readFile(finalPath)
          if (buf.length < 5 * 1024 * 1024 && !buf.includes(0)) {
            content = buf.toString('utf-8')
            type = 'text'
          } else {
            type = 'binary'
            content = `[二进制文件已存入沙盒: ${finalPath}]`
          }
        }
        
        // 返回相对路径，前端可拼接 http://localhost:8001/memories/...
        const relativePath = '/memories/' + path.relative(memoriesRoot, finalPath).replace(/\\/g, '/')
        
        res.json({
          success: true,
          file_name: safeName,
          file_path: relativePath,
          type,
          content,
          base64
        })
      } catch (err: any) {
        res.status(500).json({ error: err.message })
      }
    })

    // --- Upload and Parse File for Local Knowledge Base ---
    app.post('/api/knowledge_bases/:id/upload', upload.single('file'), async (req, res) => {
      try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
        const kbId = req.params.id
        const db = await getDb()

        // 获取用于生成向量的模型配置
        const model = await db.get(`SELECT * FROM models ORDER BY is_default DESC, is_builtin DESC LIMIT 1`)
        if (!model) throw new Error('No model configured for embedding generation')

        let originalName = req.body.filename || req.file.originalname
        try {
          if (!req.body.filename && /[\\x80-\\xFF]/.test(originalName)) {
            originalName = Buffer.from(originalName, 'latin1').toString('utf8')
          }
        } catch(e) {}
        const safeName = originalName.replace(/[\\\\/]/g, '_')
        const ext = path.extname(safeName).toLowerCase()
        
        // multer 默认不会保存后缀名，而 officeparser 严格依赖后缀名判断文件类型，所以我们需要重命名一下临时文件
        const finalPath = req.file.path + ext
        await fs.promises.rename(req.file.path, finalPath)

        let content = ''
        
        // 解析文件内容
        if (ext === '.pdf') {
          const pdfParseModule = await import('pdf-parse')
          const pdfParse = pdfParseModule.default || pdfParseModule
          const buf = await fs.promises.readFile(finalPath)
          const data = await pdfParse(buf)
          content = data.text
        } else if (['.xlsx', '.xls', '.csv'].includes(ext)) {
          const XLSXModule = await import('xlsx')
          const XLSX = XLSXModule.default || XLSXModule
          const workbook = XLSX.readFile(finalPath)
          for (const sheetName of workbook.SheetNames) {
            content += `\n--- Sheet: ${sheetName} ---\n` + XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName])
          }
        } else if (['.docx', '.pptx', '.doc', '.ppt'].includes(ext)) {
          const officeParserModule = await import('officeparser')
          const officeParser = officeParserModule.default || officeParserModule
          const ast = await officeParser.parseOffice(finalPath)
          content = typeof ast === 'string' ? ast : (ast.toText ? ast.toText() : String(ast))
        } else {
          // txt, md 等文本文件
          const buf = await fs.promises.readFile(finalPath)
          if (buf.length < 5 * 1024 * 1024 && !buf.includes(0)) content = buf.toString('utf-8')
        }

        if (!content || !content.trim()) throw new Error('文件解析结果为空或不支持该格式。')
        
        // 改进的分块逻辑：基于段落和句子的分割
        const initialChunks: string[] = []
        const chunkSize = 600
        const overlap = 100
        
        // 1. 先按段落分割 (双换行)
        const paragraphs = content.split(/\n\s*\n/)
        let currentChunk = ''
        
        for (const para of paragraphs) {
          const trimmed = para.trim()
          if (!trimmed) continue
          
          if (currentChunk.length + trimmed.length > chunkSize && currentChunk.length > 0) {
            initialChunks.push(currentChunk)
            // 提取重叠部分：尽量按标点/句子截取
            const sentences = currentChunk.match(/[^。！？.!?]+[。！？.!?]*/g) || [currentChunk]
            let overlapText = ''
            for (let i = sentences.length - 1; i >= 0; i--) {
              if (overlapText.length + sentences[i].length <= overlap) {
                overlapText = sentences[i] + overlapText
              } else {
                break
              }
            }
            if (!overlapText) overlapText = currentChunk.substring(currentChunk.length - overlap)
            currentChunk = overlapText + (overlapText.endsWith('\n') ? '' : '\n\n') + trimmed
          } else {
            currentChunk += (currentChunk ? '\n\n' : '') + trimmed
          }
        }
        if (currentChunk) initialChunks.push(currentChunk)
        
        // 2. 二次处理超长分块 (如果有单个段落极其长的情况)
        const chunks: string[] = []
        for (const chunk of initialChunks) {
          if (chunk.length > chunkSize + 150) {
            // 按标点或单换行强制切分
            const subParts = chunk.split(/(?<=[。！？.!?\n])/g)
            let tempChunk = ''
            for (const part of subParts) {
              if (tempChunk.length + part.length > chunkSize && tempChunk.length > 0) {
                chunks.push(tempChunk)
                tempChunk = tempChunk.substring(Math.max(0, tempChunk.length - overlap)) + part
              } else {
                tempChunk += part
              }
            }
            if (tempChunk) chunks.push(tempChunk)
          } else {
            chunks.push(chunk)
          }
        }

        // 调用本地模型生成向量特征 (Embeddings)
        const vectors = await getLocalEmbeddings(chunks)

        // 存入 kb_chunks
        const insertStmt = await db.prepare(`INSERT INTO kb_chunks (kb_id, file_name, chunk_text, embedding) VALUES (?, ?, ?, ?)`)
        for (let i = 0; i < chunks.length; i++) {
           await insertStmt.run(kbId, safeName, chunks[i], JSON.stringify(vectors[i]))
        }
        await insertStmt.finalize()

        // 结束后删除临时文件
        await fs.promises.unlink(finalPath).catch(()=>{})

        res.json({ success: true, file_name: safeName, chunks_count: chunks.length })
      } catch (err: any) {
        console.error('KB Upload Error:', err)
        res.status(500).json({ error: err.message })
      }
    })

    app.post('/api/agents/:id/chat', async (req, res) => {
      const db = await getDb()
      const agentId = req.params.id
      const { messages } = req.body

      try {
        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')
        res.flushHeaders()

        const { executeAgent } = await import('./agent_runner')
        
        await executeAgent(agentId, messages, db, {
          sessionId: req.body.sessionId || req.query.sessionId as string | undefined,
          onEvent: (type, payload) => {
            if (payload) {
              res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`)
            } else {
              res.write(`data: ${JSON.stringify({ type })}\n\n`)
            }
          }
        })
        
        res.end()
      } catch (err: any) {
        console.error('Chat error:', err)
        res.write(`data: ${JSON.stringify({ type: 'RUN_ERROR', error: err.message })}\n\n`)
        res.end()
      }
    })

    app.post('/api/agents/:id/recordings', upload.single('video'), async (req, res) => {
      try {
        if (!req.file) return res.status(400).json({ error: 'No video file provided' })
        const agentId = req.params.id
        const sessionId = req.body.sessionId || req.query.sessionId as string | undefined
        const { agentDir } = await initAgentMemoryDir(agentId, sessionId)
        
        const recordingsDir = path.join(agentDir, 'recordings')
        await fs.promises.mkdir(recordingsDir, { recursive: true })
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const finalPath = path.join(recordingsDir, `interview_${timestamp}.webm`)
        
        await fs.promises.copyFile(req.file.path, finalPath)
        await fs.promises.unlink(req.file.path)
        
        res.json({ success: true, file_path: finalPath })
      } catch (error) {
        console.error('Failed to save recording:', error)
        res.status(500).json({ error: 'Failed to save recording' })
      }
    })

    // --- Chat Endpoint ---
    app.post('/api/mcp/ping/:id', async (req, res) => {
      try {
        const db = await getDb()
        const mcpServer = await db.get(`SELECT * FROM mcp_servers WHERE id = ?`, [req.params.id])
        if (!mcpServer) return res.status(404).json({ error: 'Server not found' })
        
        let config: any = {}
        if (typeof mcpServer.config === 'string') {
          try { config = JSON.parse(mcpServer.config) } catch(e) {}
        } else if (mcpServer.config) {
          config = mcpServer.config
        }
        
        const type = config.type || 'stdio'
        let transport: any
        
        const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
        
        if (type === 'sse') {
          const url = mcpServer.url
          if (!url) return res.status(400).json({ error: 'Missing SSE URL' })
          const { SSEClientTransport } = await import('@modelcontextprotocol/sdk/client/sse.js')
          transport = new SSEClientTransport(new URL(url))
        } else {
          const command = config.command
          const args = config.args || []
          const env = config.env || {}
          if (!command) return res.status(400).json({ error: 'Missing command' })
          const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js')
          transport = new StdioClientTransport({
            command,
            args,
            env: { ...process.env, ...env }
          })
        }

        const client = new Client({
          name: 'Agent Flow Platform',
          version: '1.0.0'
        }, {
          capabilities: { tools: {} }
        })

        await client.connect(transport)
        const response = await client.listTools()
        await transport.close()
        
        res.json({ success: true, tools: response.tools })
      } catch (error: any) {
        console.error('MCP Ping Error:', error)
        res.status(500).json({ error: error.message || 'Unknown Error' })
      }
    })

    // --- MCP Test Configuration Endpoint ---
    app.post('/api/mcp/test', async (req, res) => {
      try {
        const { connection_type, command, args, env, url } = req.body
        const type = connection_type || 'stdio'
        let transport: any
        
        const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
        
        if (type === 'sse') {
          if (!url) return res.status(400).json({ error: 'Missing SSE URL' })
          const { SSEClientTransport } = await import('@modelcontextprotocol/sdk/client/sse.js')
          transport = new SSEClientTransport(new URL(url))
        } else {
          if (!command) return res.status(400).json({ error: 'Missing command' })
          const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js')
          transport = new StdioClientTransport({
            command,
            args: args ? args.split(',').map((a: string) => a.trim()).filter((a: string) => a) : [],
            env: { ...process.env, ...(env ? JSON.parse(env) : {}) }
          })
        }

        const client = new Client({ name: 'Test', version: '1.0' }, { capabilities: { tools: {} } })
        await client.connect(transport)
        const response = await client.listTools()
        await transport.close()
        
        res.json({ success: true, tools: response.tools })
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Unknown Error' })
      }
    })

    // --- Built-in Tools Test Endpoint ---
    app.post('/api/tools/run', async (req, res) => {
      try {
        const { code, test_args } = req.body
        let parsedArgs = {}
        if (test_args) parsedArgs = JSON.parse(test_args)
        const func = new Function('args', 'require', `return (async () => { ${code} })()`)
        const result = await func(parsedArgs, _require)
        res.json({ success: true, result })
      } catch (error: any) {
        res.status(400).json({ error: error.message })
      }
    })

    // --- Skills: Upload Local Package ---
    app.post('/api/skills/upload-local', upload.single('file'), async (req, res) => {
      try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
        
        let content = ''
        let filesList: Array<{path: string, content: string}> = []
        const ext = path.extname(req.file.originalname).toLowerCase()
        
        if (ext === '.zip') {
          const zip = new AdmZip(req.file.path)
          filesList = extractFilesFromZip(zip)
          const skillEntry = filesList.find(e => e.path.toLowerCase() === 'skill.md' || e.path.toLowerCase().endsWith('/skill.md'))
          if (!skillEntry) throw new Error('Zip package must contain a SKILL.md file')
          content = skillEntry.content
          // Fix path if it's extracted from a single root directory inside zip
          if (skillEntry.path !== 'SKILL.md' && skillEntry.path.toLowerCase().endsWith('/skill.md')) {
            const rootDir = skillEntry.path.substring(0, skillEntry.path.toLowerCase().lastIndexOf('skill.md'))
            filesList = filesList.map(f => ({
              ...f,
              path: f.path.startsWith(rootDir) ? f.path.substring(rootDir.length) : f.path
            }))
          }
        } else if (ext === '.md') {
          content = fs.readFileSync(req.file.path, 'utf-8')
          filesList = [{ path: req.file.originalname, content }]
        } else {
          throw new Error('Unsupported file format. Please upload .zip or .md')
        }
        
        fs.unlinkSync(req.file.path) // Cleanup
        
        const fallbackName = req.file.originalname.replace(ext, '')
        const parsed = parseSkillMarkdown(content, fallbackName)
        
        const db = await getDb()
        const result = await db.run(`INSERT INTO skills (name, description, content, files) VALUES (?, ?, ?, ?)`, [parsed.name, parsed.description, parsed.content, JSON.stringify(filesList)])
        const row = await db.get(`SELECT * FROM skills WHERE id = ?`, result.lastID)
        res.json(row)
      } catch (err: any) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
        res.status(500).json({ error: err.message })
      }
    })

    // --- Get Local Knowledge Base Files ---
    app.get('/api/knowledge_bases/:id/files', async (req, res) => {
      try {
        const db = await getDb()
        const rows = await db.all(`SELECT file_name, COUNT(*) as chunk_count FROM kb_chunks WHERE kb_id = ? GROUP BY file_name`, req.params.id)
        res.json({ success: true, files: rows })
      } catch (err: any) {
        res.status(500).json({ error: err.message })
      }
    })

    // --- Get Specific File Chunks ---
    app.get('/api/knowledge_bases/:id/files/:filename/chunks', async (req, res) => {
      try {
        const db = await getDb()
        const rows = await db.all(`SELECT id, chunk_text FROM kb_chunks WHERE kb_id = ? AND file_name = ?`, req.params.id, req.params.filename)
        res.json({ success: true, chunks: rows })
      } catch (err: any) {
        res.status(500).json({ error: err.message })
      }
    })

    // --- Delete Specific File from Knowledge Base ---
    app.delete('/api/knowledge_bases/:id/files/:filename', async (req, res) => {
      try {
        const db = await getDb()
        await db.run(`DELETE FROM kb_chunks WHERE kb_id = ? AND file_name = ?`, req.params.id, req.params.filename)
        res.json({ success: true })
      } catch (err: any) {
        res.status(500).json({ error: err.message })
      }
    })

    // --- Skills: GitLab Pull ---
    app.post('/api/skills/git-pull', async (req, res) => {
      let tempDir = ''
      try {
        const { repo_url, branch, token } = req.body
        if (!repo_url) return res.status(400).json({ error: 'Repository URL is required' })

        tempDir = path.join(os.tmpdir(), `skill-git-${Date.now()}`)
        fs.mkdirSync(tempDir, { recursive: true })

        // 构造带 Token 的克隆链接 (如果是 http(s) 协议)
        let cloneUrl = repo_url
        if (token && cloneUrl.startsWith('http')) {
           const urlObj = new URL(cloneUrl)
           urlObj.username = 'oauth2'
           urlObj.password = token
           cloneUrl = urlObj.toString()
        }

        const branchFlag = branch ? `--branch ${branch}` : ''
        await execAsync(`git clone --depth 1 ${branchFlag} ${cloneUrl} .`, { cwd: tempDir })

        // 查找 SKILL.md
        const targetFile = ['SKILL.md', 'README.md', 'skill.md'].map(f => path.join(tempDir, f)).find(f => fs.existsSync(f))
        
        if (!targetFile) throw new Error('Could not find SKILL.md or README.md in the repository root')
        
        const content = fs.readFileSync(targetFile, 'utf-8')
        const parsed = parseSkillMarkdown(content, 'GitLab Imported Skill')
        
        const db = await getDb()
        const result = await db.run(`INSERT INTO skills (name, description, content) VALUES (?, ?, ?)`, [parsed.name, parsed.description, parsed.content])
        const row = await db.get(`SELECT * FROM skills WHERE id = ?`, result.lastID)
        
        // 尝试清理
        fs.rmSync(tempDir, { recursive: true, force: true })
        
        res.json(row)
      } catch (err: any) {
        if (tempDir && fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true })
        res.status(500).json({ error: err.message })
      }
    })

    // --- Knowledge Base Test Endpoint ---
    app.post('/api/knowledge_bases/test', async (req, res) => {
      try {
        const { type, url, method, headers, body, json_path, result_text_field, test_query } = req.body
        if (type === 'remote') {
          const data = await executeKnowledgeBaseQuery(test_query || '', {
            type: 'remote', url, method, headers, body, json_path, result_text_field
          })
          res.json({ success: true, result: data })
        } else {
          // Local Vector DB test
          if (!req.body.id) throw new Error('Knowledge Base ID is required for local test')
          // BGE 模型检索要求 Query 添加前缀以提高精度
          const bgeQueryPrefix = "为这个句子生成表示以用于检索相关文章："
          const queryEmbeddings = await getLocalEmbeddings([bgeQueryPrefix + (test_query || 'test')])
          const queryEmbedding = queryEmbeddings[0]
          const db = await getDb()
          const rows = await db.all(`SELECT file_name, chunk_text, embedding FROM kb_chunks WHERE kb_id = ?`, req.body.id)
          
          const results = rows.map((row: any) => {
            const chunkVector = JSON.parse(row.embedding)
            const similarity = cosineSimilarity(queryEmbedding, chunkVector)
            return { file_name: row.file_name, chunk_text: row.chunk_text, similarity }
          })
          
          results.sort((a: any, b: any) => b.similarity - a.similarity)
          const topResults = results.slice(0, 5)
          res.json({ success: true, result: topResults })
        }
      } catch (err: any) {
        res.status(500).json({ error: err.message })
      }
    })

    // --- Model Test Endpoint ---
    app.post('/api/models/test', async (req, res) => {
      try {
        const { model_name, api_key, base_url, advanced_config } = req.body
        const { ChatOpenAI } = await import('@langchain/openai')
        const { HumanMessage } = await import('@langchain/core/messages')
        
        let adv: any = {}
        if (typeof advanced_config === 'string') {
          try { adv = JSON.parse(advanced_config) } catch(e) {}
        } else if (advanced_config) {
          adv = advanced_config
        }

        const chat = new ChatOpenAI({
          modelName: model_name,
          apiKey: api_key || 'sk-empty-placeholder',
          maxRetries: 0, // don't hang too long
          configuration: {
            baseURL: base_url || undefined,
            defaultHeaders: adv.headers || undefined
          }
        })
        // Send a minimal ping
        await chat.invoke([new HumanMessage('Hello')])
        res.json({ success: true, message: 'Connection successful' })
      } catch (err: any) {
        res.status(400).json({ success: false, error: err.message })
      }
    })

    // --- Generate System Prompt Endpoint ---
    app.post('/api/generate/system-prompt', async (req, res) => {
      try {
        const { name, description, keyword } = req.body
        const db = await getDb()
        
        // 任何非直接关联智能体的系统级生成任务，都走默认模型
        const defaultModel = await db.get('SELECT * FROM models WHERE is_default = 1')
        if (!defaultModel) {
          return res.status(400).json({ success: false, error: '未配置全局默认大模型，请先前往“资源中心”将某个模型设为默认。' })
        }

        const { ChatOpenAI } = await import('@langchain/openai')
        const { HumanMessage, SystemMessage } = await import('@langchain/core/messages')
        
        let adv: any = {}
        if (typeof defaultModel.advanced_config === 'string') {
          try { adv = JSON.parse(defaultModel.advanced_config) } catch(e) {}
        } else if (defaultModel.advanced_config) {
          adv = defaultModel.advanced_config
        }

        const chat = new ChatOpenAI({
          modelName: defaultModel.model_name,
          apiKey: defaultModel.api_key || 'sk-empty',
          configuration: {
            baseURL: defaultModel.base_url || undefined,
            defaultHeaders: adv.headers || undefined
          }
        })
        
        const sysMsg = new SystemMessage(`你是一个出色的提示词专家(Prompt Engineer)。请根据用户提供的智能体信息和核心要求，为其生成一段专业、严谨的 System Prompt。
要求：
1. 明确设定智能体的角色、目标、语气。
2. 给出具体的工作流或约束规则。
3. 纯文本输出，不要使用markdown代码块包裹，直接输出提示词正文。`)

        const result = await chat.invoke([
          sysMsg,
          new HumanMessage(`智能体名称：${name}\n简要描述：${description || '暂无'}\n核心关键词/要求：${keyword || '请自由发挥扩展'}`)
        ])
        
        res.json({ success: true, prompt: result.content })
      } catch (err: any) {
        res.status(500).json({ success: false, error: err.message })
      }
    })

    app.post('/api/generate/tool', async (req, res) => {
      try {
        const { instruction } = req.body
        const db = await getDb()
        
        const defaultModel = await db.get('SELECT * FROM models WHERE is_default = 1')
        if (!defaultModel) {
          return res.status(400).json({ success: false, error: '未配置全局默认大模型，请先前往“资源中心”将某个模型设为默认。' })
        }

        const { ChatOpenAI } = await import('@langchain/openai')
        const { HumanMessage, SystemMessage } = await import('@langchain/core/messages')
        
        let adv: any = {}
        if (typeof defaultModel.advanced_config === 'string') {
          try { adv = JSON.parse(defaultModel.advanced_config) } catch(e) {}
        } else if (defaultModel.advanced_config) {
          adv = defaultModel.advanced_config
        }

        const chat = new ChatOpenAI({
          modelName: defaultModel.model_name,
          apiKey: defaultModel.api_key || 'sk-empty',
          configuration: {
            baseURL: defaultModel.base_url || undefined,
            defaultHeaders: adv.headers || undefined
          }
        })
        
        const sysMsg = new SystemMessage(`你是一个资深的全栈工程师。根据用户的需求，生成一个可以用于智能体沙箱的工具(Tool)配置。
要求：
1. 返回严格的 JSON 对象，包含以下 4 个字段，不要使用 markdown 代码块包裹，纯文本输出：
   - "name": 工具唯一英文标识，全小写，下划线分隔，如 "list_directory"。
   - "description": 工具功能的简短中文描述。
   - "parameters": 工具入参的 JSON Schema（转为字符串），如 "{\\"type\\":\\"object\\",\\"properties\\":{\\"path\\":{\\"type\\":\\"string\\"}}}”。如果不需要参数，设为 "{\\"type\\":\\"object\\",\\"properties\\":{}}"。
   - "code": 工具执行的 Node.js 沙箱逻辑代码。沙箱会注入 \`args\` 对象作为入参。比如 \`const fs = require('fs'); const { path } = args; return fs.readdirSync(path);\`. 不能使用 import 语法，必须用 require。返回值会被收集。

只输出上述规定的 JSON，不得输出多余的解释。`)

        const result = await chat.invoke([
          sysMsg,
          new HumanMessage(`用户需求：${instruction}`)
        ])
        
        let content = result.content as string
        // 清理可能的 markdown 代码块
        if (content.startsWith('\`\`\`json')) {
          content = content.replace(/^\`\`\`json\n/, '').replace(/\n\`\`\`$/, '')
        } else if (content.startsWith('\`\`\`')) {
          content = content.replace(/^\`\`\`\n/, '').replace(/\n\`\`\`$/, '')
        }
        
        const parsed = JSON.parse(content)
        res.json({ success: true, tool: parsed })
      } catch (err: any) {
        res.status(500).json({ success: false, error: err.message })
      }
    })

    app.post('/api/generate/skill', async (req, res) => {
      try {
        const { instruction } = req.body
        const db = await getDb()
        
        const defaultModel = await db.get('SELECT * FROM models WHERE is_default = 1')
        if (!defaultModel) {
          return res.status(400).json({ success: false, error: '未配置全局默认大模型，请先前往“资源中心”将某个模型设为默认。' })
        }

        const { ChatOpenAI } = await import('@langchain/openai')
        const { HumanMessage, SystemMessage } = await import('@langchain/core/messages')
        
        let adv: any = {}
        if (typeof defaultModel.advanced_config === 'string') {
          try { adv = JSON.parse(defaultModel.advanced_config) } catch(e) {}
        } else if (defaultModel.advanced_config) {
          adv = defaultModel.advanced_config
        }

        const chat = new ChatOpenAI({
          modelName: defaultModel.model_name,
          apiKey: defaultModel.api_key || 'sk-empty',
          configuration: {
            baseURL: defaultModel.base_url || undefined,
            defaultHeaders: adv.headers || undefined
          }
        })
        
        const sysMsg = new SystemMessage(`你是一个资深的 AI Agent 技能库工程师。根据用户的需求，生成一个智能体技能(Skill)文档。
技能采用纯 Markdown 编写，并且必须使用 YAML frontmatter 描述元数据。
要求：
1. 返回严格的 JSON 对象，包含以下 3 个字段，不要使用 markdown 代码块包裹，纯文本输出：
   - "name": 技能唯一英文标识，全小写，连字符分隔，如 "data-analyzer"。
   - "description": 技能功能的简短中文描述。
   - "content": 包含完整 YAML frontmatter 的 Markdown 格式技能指南文档。在 YAML 中必须包含 name 和 description 字段。正文部分用自然语言详细描述该技能的执行流程、规则、示例等，让大模型阅读后能理解如何执行。

只输出上述规定的 JSON，不得输出多余的解释。`)

        const result = await chat.invoke([
          sysMsg,
          new HumanMessage(`用户需求：${instruction}`)
        ])
        
        let content = result.content as string
        if (content.startsWith('\`\`\`json')) {
          content = content.replace(/^\`\`\`json\n/, '').replace(/\n\`\`\`$/, '')
        } else if (content.startsWith('\`\`\`')) {
          content = content.replace(/^\`\`\`\n/, '').replace(/\n\`\`\`$/, '')
        }
        
        const parsed = JSON.parse(content)
        const insertResult = await db.run(`INSERT INTO skills (name, description, content, files) VALUES (?, ?, ?, ?)`, [parsed.name, parsed.description, parsed.content, '[]'])
        const row = await db.get(`SELECT * FROM skills WHERE id = ?`, insertResult.lastID)
        
        res.json({ success: true, skill: row })
      } catch (err: any) {
        res.status(500).json({ success: false, error: err.message })
      }
    })

    // --- Engine ---
    app.post('/api/compile/:id', async (req, res) => {
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.flushHeaders()
      
      try {
        await compileGraph(req.body.nodes, req.body.edges, req.body.inputData, (chunk) => {
          res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`)
        })
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
        res.end()
      } catch (err: any) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`)
        res.end()
      }
    })

    let retries = 5
    const tryListen = () => {
      const server = app.listen(8001, '127.0.0.1', () => {
        console.log(`✅ Local Express Server started on http://127.0.0.1:8001`)
        resolve(server)
      }).on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          if (retries > 0) {
            retries--
            console.log('Port 8001 is in use, retrying in 1s...')
            setTimeout(tryListen, 1000)
          } else {
            console.error('Port 8001 is persistently in use. Proceeding without starting local server.')
            resolve(null as any)
          }
        } else {
          console.error(err)
          resolve(null as any)
        }
      })
    }
    tryListen()
  })
}
