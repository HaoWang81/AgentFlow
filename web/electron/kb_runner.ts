import { getDb } from "./database";
import { exec } from 'child_process';
import path from 'path';

export async function executeKnowledgeBaseQuery(query: string, config: any): Promise<any> {
  if (config.type === 'remote') {
    const { url, method, headers, body, json_path, result_text_field } = config;
    const fetchOpts: any = { method: method || 'GET', headers: headers ? (typeof headers === 'string' ? JSON.parse(headers) : headers) : {} };
    if (method !== 'GET' && body) {
      const safeQuery = query ? JSON.stringify(query).slice(1, -1) : 'test';
      fetchOpts.body = body.replace(/\{\{query\}\}/g, safeQuery);
      fetchOpts.headers['Content-Type'] = fetchOpts.headers['Content-Type'] || 'application/json';
    }
    let fetchUrl = url;
    if (method === 'GET' && query) {
      fetchUrl += (fetchUrl.includes('?') ? '&' : '?') + `query=${encodeURIComponent(query)}`;
    }
    const fetchRes = await fetch(fetchUrl, fetchOpts);
    if (!fetchRes.ok) throw new Error(`HTTP Error ${fetchRes.status}`);
    const data = await fetchRes.json();
    
    let extracted = data;
    if (json_path && json_path.startsWith('$.')) {
      const parts = json_path.substring(2).split('.').filter(Boolean);
      for (const part of parts) {
        if (extracted && extracted[part] !== undefined) extracted = extracted[part];
      }
    }
    
    if (Array.isArray(extracted) && result_text_field) {
      extracted = extracted.map((item: any) => {
        if (typeof item === 'object' && item !== null && item[result_text_field] !== undefined) {
          return { text: item[result_text_field], _original: item };
        }
        return item;
      });
    }
    
    return extracted;
  } else {
    // Local Vector DB test
    if (!config.id) throw new Error('Knowledge Base ID is required for local test');
    // BGE 模型检索要求 Query 添加前缀以提高精度
    const bgeQuery = `为这个句子生成表示以用于检索相关文章：${query}`;
    const pyScript = path.join(__dirname, '..', 'py_scripts', 'vector_search.py');
    const dbPath = path.join(process.env.APPDATA || process.env.HOME || '', '.gemini', 'antigravity-ide', 'kb_vectors.sqlite');
    
    return new Promise((resolve, reject) => {
      exec(`python "${pyScript}" "${bgeQuery}" "${config.id}" "${dbPath}"`, (error, stdout, stderr) => {
        if (error) {
          console.error(`Local KB search error: ${error.message}\nStderr: ${stderr}`);
          return reject(error);
        }
        try {
          const results = JSON.parse(stdout);
          const mapped = results.map((r: any) => ({
            text: r.text,
            _original: { score: r.score, file_name: r.file_name }
          }));
          resolve(mapped);
        } catch (e: any) {
          console.error(`Failed to parse python output: ${stdout}`);
          reject(new Error("Python script returned invalid JSON: " + e.message));
        }
      });
    });
  }
}

export async function queryKnowledgeBaseById(kbId: string | number, query: string): Promise<string> {
  const db = await getDb();
  const kDb = await db.get('SELECT * FROM knowledge_bases WHERE id = ?', kbId);
  if (!kDb || !kDb.config) {
    throw new Error('未找到该知识库配置');
  }

  const config = JSON.parse(kDb.config);
  config.id = kbId; // For local db search
  const extracted = await executeKnowledgeBaseQuery(query, config);
  
  if (typeof extracted === 'string') {
    return extracted;
  }
  
  if (Array.isArray(extracted)) {
    // Check if it's an array of objects from the local vector DB or from remote that preserved objects
    return extracted.map((item, index) => {
      const text = typeof item === 'object' && item !== null ? (item.text || JSON.stringify(item)) : item;
      return `${index + 1}. ${text}`;
    }).join('\n\n');
  }
  
  return JSON.stringify(extracted, null, 2);
}
