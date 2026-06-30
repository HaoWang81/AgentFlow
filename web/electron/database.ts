import sqlite3 from 'sqlite3'
import { open, Database } from 'sqlite'
import { app } from 'electron'
import path from 'path'

const userDataPath = app ? app.getPath('userData') : process.cwd()
const dbPath = path.join(userDataPath, 'antigravity_workflow.db')

let dbPromise: Promise<Database<sqlite3.Database, sqlite3.Statement>> | null = null
let dbReadyPromise: Promise<Database<sqlite3.Database, sqlite3.Statement>> | null = null

export function initDatabase() {
  dbPromise = open({
    filename: dbPath,
    driver: sqlite3.Database
  })
  
  dbReadyPromise = dbPromise.then(async (db) => {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS workflows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        nodes TEXT DEFAULT '[]',
        edges TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `)

    await db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        avatar TEXT,
        model_name TEXT DEFAULT 'gpt-4o',
        llm_config TEXT DEFAULT '{"temperature":0.7,"top_p":1.0,"max_tokens":2048,"rounds":10}',
        system_prompt TEXT,
        tools TEXT DEFAULT '[]',
        mcp_servers TEXT DEFAULT '[]',
        plugins TEXT DEFAULT '[]',
        knowledge_bases TEXT DEFAULT '[]',
        skills TEXT DEFAULT '[]',
        sub_agents TEXT DEFAULT '[]',
        memory_enabled INTEGER DEFAULT 1,
        enable_video INTEGER DEFAULT 1,
        enable_voice INTEGER DEFAULT 1,
        cron_enabled INTEGER DEFAULT 0,
        cron_config TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `)

    await db.exec(`
      CREATE TABLE IF NOT EXISTS models (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        model_name TEXT NOT NULL,
        base_url TEXT,
        api_key TEXT,
        default_config TEXT,
        advanced_config TEXT,
        is_builtin INTEGER DEFAULT 0,
        is_default INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `)

    try {
      await db.exec('ALTER TABLE agents ADD COLUMN skills TEXT DEFAULT "[]"')
    } catch(e) {}

    try {
      await db.exec('ALTER TABLE agents ADD COLUMN sub_agents TEXT DEFAULT "[]"')
    } catch(e) {}

    try {
      await db.exec('ALTER TABLE agents ADD COLUMN enable_video INTEGER DEFAULT 1')
      await db.exec('ALTER TABLE agents ADD COLUMN enable_voice INTEGER DEFAULT 1')
    } catch(e) {}

    try {
      await db.exec('ALTER TABLE agents ADD COLUMN cron_enabled INTEGER DEFAULT 0')
      await db.exec('ALTER TABLE agents ADD COLUMN cron_config TEXT DEFAULT "{}"')
    } catch(e) {}

    try {
      await db.exec('ALTER TABLE models ADD COLUMN is_default INTEGER DEFAULT 0')
      await db.run('UPDATE models SET is_default = 1 WHERE model_name = "gpt-4o"')
    } catch(e) {
      // Column might already exist, ignore
    }

    await db.exec(`
      CREATE TABLE IF NOT EXISTS skills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        content TEXT,
        files TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `)

    try {
      await db.exec('ALTER TABLE skills ADD COLUMN files TEXT DEFAULT "[]"')
    } catch(e) {
      // Column might already exist, ignore
    }

    await db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_bases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        config TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `)

    await db.exec(`
      CREATE TABLE IF NOT EXISTS kb_chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kb_id INTEGER NOT NULL,
        file_name TEXT,
        chunk_text TEXT,
        embedding TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `)

    await db.exec(`
      CREATE TABLE IF NOT EXISTS mcp_servers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        url TEXT,
        config TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `)

    await db.exec(`
      CREATE TABLE IF NOT EXISTS tools (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        parameters TEXT,
        code TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `)

    await db.exec(`
      CREATE TABLE IF NOT EXISTS agent_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id INTEGER NOT NULL,
        trigger_type TEXT DEFAULT 'cron',
        status TEXT DEFAULT 'running',
        input_params TEXT,
        result TEXT,
        artifacts TEXT,
        error_msg TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `)

    // Schema Migrations
    try { await db.exec(`ALTER TABLE agent_runs ADD COLUMN input_params TEXT;`) } catch (e) { /* ignore if exists */ }
    try { await db.exec(`ALTER TABLE agent_runs ADD COLUMN artifacts TEXT;`) } catch (e) { /* ignore if exists */ }

    // Seed builtin models if none exist
    const modelCount = await db.get('SELECT COUNT(*) as count FROM models')
    if (modelCount.count === 0) {
      const builtins = [
        ['GPT-4o', 'gpt-4o', 'https://api.openai.com/v1', '', '{"temperature":0.7,"top_p":1.0,"max_tokens":2048}', '{}', 1],
        ['GPT-4o Mini', 'gpt-4o-mini', 'https://api.openai.com/v1', '', '{"temperature":0.7,"top_p":1.0,"max_tokens":2048}', '{}', 1],
        ['Claude 3.5 Sonnet', 'claude-3-5-sonnet-20240620', 'https://api.anthropic.com', '', '{"temperature":0.7}', '{}', 1],
        ['Gemini 1.5 Pro', 'gemini-1.5-pro', 'https://generativelanguage.googleapis.com', '', '{"temperature":0.7}', '{}', 1]
      ]
      for (const m of builtins) {
        await db.run(
          'INSERT INTO models (name, model_name, base_url, api_key, default_config, advanced_config, is_builtin) VALUES (?, ?, ?, ?, ?, ?, ?)',
          m
        )
      }
      console.log('✅ Seeded built-in models')
    }
    console.log('✅ SQLite Database initialized at', dbPath)
    return db;
  })
}

export function getDb() {
  if (!dbReadyPromise) throw new Error('Database not initialized')
  return dbReadyPromise
}
