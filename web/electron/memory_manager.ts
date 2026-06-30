import { app } from 'electron'
import path from 'path'
import fs from 'fs/promises'

// 获取应用数据目录
const userDataPath = app ? app.getPath('userData') : process.cwd()
export const memoriesRoot = path.join(userDataPath, 'memories')

/**
 * 确保 Agent 的记忆目录结构存在
 */
export async function initAgentMemoryDir(agentId: string | number, sessionId?: string) {
  const globalAgentDir = path.join(memoriesRoot, `agent_${agentId}`)
  let agentDir = globalAgentDir

  try {
    await fs.mkdir(globalAgentDir, { recursive: true })
    const date = new Date().toISOString().split('T')[0]
    const memoryFile = path.join(globalAgentDir, `memory_${date}.md`)
    try {
      await fs.access(memoryFile)
    } catch {
      // 当日核心记忆文件不存在，初始化
      await fs.writeFile(memoryFile, `# 核心记忆 (Core Memory - ${date})\n\n在这里记录关于用户的偏好、事实和长期有效的重要设定。\n\n`, 'utf-8')
    }

    if (sessionId) {
      agentDir = path.join(globalAgentDir, 'sessions', sessionId)
      await fs.mkdir(agentDir, { recursive: true })
    }

    const logsDir = path.join(agentDir, 'logs')
    await fs.mkdir(logsDir, { recursive: true })
    return { agentDir, logsDir }
  } catch (err) {
    console.error(`初始化智能体 ${agentId} 记忆目录失败:`, err)
    return { agentDir, logsDir: path.join(agentDir, 'logs') }
  }
}

/**
 * 读取核心记忆
 */
export async function readCoreMemory(agentId: string | number): Promise<string> {
  const globalAgentDir = path.join(memoriesRoot, `agent_${agentId}`)
  try {
    const files = await fs.readdir(globalAgentDir)
    const memoryFiles = files.filter(f => f === 'MEMORY.md' || (f.startsWith('memory_') && f.endsWith('.md'))).sort()
    
    let fullMemory = ''
    for (const file of memoryFiles) {
      const content = await fs.readFile(path.join(globalAgentDir, file), 'utf-8')
      fullMemory += `\n\n--- [来自文件: ${file}] ---\n\n${content}`
    }
    return fullMemory.trim()
  } catch {
    return ''
  }
}

/**
 * 更新或追加核心记忆
 */
export async function updateCoreMemory(agentId: string | number, fact: string): Promise<boolean> {
  const date = new Date().toISOString().split('T')[0]
  const memoryFile = path.join(memoriesRoot, `agent_${agentId}`, `memory_${date}.md`)
  try {
    try {
      await fs.access(memoryFile)
    } catch {
      await fs.writeFile(memoryFile, `# 核心记忆 (Core Memory - ${date})\n\n在这里记录关于用户的偏好、事实和长期有效的重要设定。\n\n`, 'utf-8')
    }
    const timestamp = new Date().toISOString()
    const entry = `- [${timestamp}] ${fact}\n`
    await fs.appendFile(memoryFile, entry, 'utf-8')
    return true
  } catch (err) {
    console.error('更新核心记忆失败:', err)
    return false
  }
}

/**
 * 追加每日对话日志 (Archival Memory)
 */
export async function appendDailyLog(agentId: string | number, role: 'user' | 'assistant', content: string): Promise<void> {
  const date = new Date().toISOString().split('T')[0] // YYYY-MM-DD
  const logsDir = path.join(memoriesRoot, `agent_${agentId}`, 'logs')
  const logFile = path.join(logsDir, `${date}.md`)
  
  try {
    await fs.mkdir(logsDir, { recursive: true }) // 确保目录存在
    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    const entry = `\n### [${timestamp}] ${role.toUpperCase()}\n${content}\n`
    await fs.appendFile(logFile, entry, 'utf-8')
  } catch (err) {
    console.error('追加每日日志失败:', err)
  }
}

/**
 * 检索历史归档日志
 */
export async function searchArchivalMemory(agentId: string | number, query: string, mode: 'search' | 'first' | 'last' = 'search'): Promise<string> {
  const logsDir = path.join(memoriesRoot, `agent_${agentId}`, 'logs')
  const results: string[] = []
  
  try {
    const files = await fs.readdir(logsDir)
    if (files.length === 0) return '未检索到相关历史记录。'
    
    // 按时间排序（旧的在前）
    files.sort()
    
    if (mode === 'first') {
      const oldestFile = files.find(f => f.endsWith('.md'))
      if (oldestFile) {
        const filePath = path.join(logsDir, oldestFile)
        const content = await fs.readFile(filePath, 'utf-8')
        const blocks = content.split('###').filter(b => b.trim() !== '')
        if (blocks.length > 0) return `[${oldestFile}] ${blocks[0].trim().substring(0, 1000)}`
      }
      return '未找到最早的记录。'
    }
    
    if (mode === 'last') {
      const newestFile = [...files].reverse().find(f => f.endsWith('.md'))
      if (newestFile) {
        const filePath = path.join(logsDir, newestFile)
        const content = await fs.readFile(filePath, 'utf-8')
        const blocks = content.split('###').filter(b => b.trim() !== '')
        if (blocks.length > 0) return `[${newestFile}] ${blocks[blocks.length - 1].trim().substring(0, 1000)}`
      }
      return '未找到最新的记录。'
    }

    // 默认 mode === 'search'
    files.reverse() // 按时间倒序查找，优先返回最近的记忆
    for (const file of files) {
      if (!file.endsWith('.md')) continue
      const filePath = path.join(logsDir, file)
      const content = await fs.readFile(filePath, 'utf-8')
      
      // 简单的高亮上下文提取（取包含关键词的段落）
      const keywords = query.toLowerCase().split(/\s+/).filter(k => k)
      const blocks = content.split('###')
      for (const block of blocks) {
        const lowerBlock = block.toLowerCase()
        if (keywords.length > 0 && keywords.some(k => lowerBlock.includes(k))) {
          results.push(`[${file.replace('.md', '')}] ${block.trim().substring(0, 500)}...`)
        }
      }
      
      // 限制返回长度防止超 token
      if (results.length >= 5) break
    }
  } catch (err) {
    console.error('检索历史日志失败:', err)
  }
  
  if (results.length === 0) return '未检索到相关历史记录。'
  return results.join('\n\n---\n\n')
}

/**
 * 获取智能体历史日志文件列表
 */
export async function listAgentLogs(agentId: string | number): Promise<string[]> {
  const logsDir = path.join(memoriesRoot, `agent_${agentId}`, 'logs')
  try {
    const files = await fs.readdir(logsDir)
    return files.filter(f => f.endsWith('.md')).map(f => f.replace('.md', '')).sort().reverse()
  } catch {
    return []
  }
}

/**
 * 读取具体的历史日志内容
 */
export async function getAgentLog(agentId: string | number, date: string): Promise<string> {
  const logFile = path.join(memoriesRoot, `agent_${agentId}`, 'logs', `${date}.md`)
  try {
    return await fs.readFile(logFile, 'utf-8')
  } catch {
    return '未找到该日期的历史记录。'
  }
}

/**
 * 删除智能体的专属记忆目录
 */
export async function deleteAgentMemoryDir(agentId: string | number): Promise<void> {
  const agentDir = path.join(memoriesRoot, `agent_${agentId}`)
  try {
    await fs.rm(agentDir, { recursive: true, force: true })
    console.log(`✅ 已彻底删除智能体 ${agentId} 的全部记忆缓存数据`)
  } catch (err) {
    console.error(`删除智能体 ${agentId} 目录失败:`, err)
  }
}

/**
 * 清理全局所有的智能体记忆数据
 */
export async function clearAllMemories(): Promise<void> {
  try {
    const files = await fs.readdir(memoriesRoot)
    for (const file of files) {
      if (file.startsWith('agent_')) {
        await fs.rm(path.join(memoriesRoot, file), { recursive: true, force: true })
      }
    }
    console.log('✅ 已清理全局所有智能体会话缓存数据')
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      console.error('全局清理缓存失败:', err)
      throw err
    }
  }
}

/**
 * 读取短期记忆上下文 (Session History)
 */
export async function loadShortTermMemory(agentId: string | number): Promise<any[]> {
  const shortTermFile = path.join(memoriesRoot, `agent_${agentId}`, 'short_term.json')
  try {
    const data = await fs.readFile(shortTermFile, 'utf-8')
    return JSON.parse(data)
  } catch {
    return []
  }
}

/**
 * 保存短期记忆上下文
 */
export async function saveShortTermMemory(agentId: string | number, messages: any[]): Promise<boolean> {
  const shortTermFile = path.join(memoriesRoot, `agent_${agentId}`, 'short_term.json')
  try {
    await fs.writeFile(shortTermFile, JSON.stringify(messages, null, 2), 'utf-8')
    return true
  } catch (err) {
    console.error('保存短期记忆失败:', err)
    return false
  }
}
