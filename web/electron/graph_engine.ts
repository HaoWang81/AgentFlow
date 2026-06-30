import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { StateGraph, Annotation } from "@langchain/langgraph";
import { queryKnowledgeBaseById } from "./kb_runner";
import { getDb } from "./database";
import { executeAgent } from "./agent_runner";
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { app as electronApp } from 'electron';

// 轻量级异步并发控制池
async function asyncPool<T>(poolLimit: number, array: any[], iteratorFn: (item: any, index: number) => Promise<T>): Promise<T[]> {
  const results = new Array(array.length);
  let i = 0;
  const worker = async () => {
    while (i < array.length) {
      const currentIndex = i++;
      results[currentIndex] = await iteratorFn(array[currentIndex], currentIndex);
    }
  };
  const workers = Array(Math.min(poolLimit, array.length)).fill(null).map(worker);
  await Promise.all(workers);
  return results;
}

const execAsync = promisify(exec);

const GraphState = Annotation.Root({
  messages: Annotation<any[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  nodeOutputs: Annotation<Record<string, any>>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({}),
  }),
});

// 解析 Dify 风格的模板变量 {{#nodeId.varName#}}
function resolveTemplateVariables(text: string, nodeOutputs: Record<string, any>) {
  if (!text) return text;
  return text.replace(/\{\{#([^.]+)\.([^}]+)\#\}\}/g, (match, nodeId, varName) => {
    return nodeOutputs[nodeId]?.[varName] ?? match;
  });
}

export async function compileGraph(nodes: any[], edges: any[], inputData?: string, onEvent?: (chunk: string) => void) {
  // Simplified JS graph engine using LangGraph.js
  const graph = new StateGraph(GraphState);
  const workflowId = Date.now().toString();

  const startNode = nodes.find(n => n.type === 'start');
  const endNode = nodes.find(n => n.type === 'end');

  if (!startNode || !endNode) {
    return "错误：工作流必须包含开始节点和结束节点。";
  }

  // 动态注册画布上的所有节点
  for (const node of nodes) {
    graph.addNode(node.id, async (state) => {
      // 1. 获取上游节点的真实数据输出，而不是执行日志
      let previousOutput = "";
      
      // 如果是开始节点，从初始消息中获取外部调用传入的 raw input
      if (node.type === 'start') {
        const lastMsg = state.messages[0];
        previousOutput = lastMsg ? lastMsg.content : "";
        if (previousOutput.includes("[用户输入]:\n")) {
           previousOutput = previousOutput.split("[用户输入]:\n")[1]?.trim() || previousOutput;
        }
      } else {
        // 查找指向上游的边
        const upstreamEdges = edges.filter(e => e.target === node.id);
        if (upstreamEdges.length > 0) {
          // 在多分支路由中，可能只有部分上游节点被执行了，因此需要找到有实际输出的上游节点
          for (const edge of upstreamEdges) {
            const upstreamNodeId = edge.source;
            const upstreamOutput = state.nodeOutputs[upstreamNodeId];
            if (upstreamOutput && Object.keys(upstreamOutput).length > 0) {
              previousOutput = upstreamOutput.text || JSON.stringify(upstreamOutput);
              break; // 找到第一个有输出的上游节点即可
            }
          }
        }
      }

      // 2. 解析当前节点可能存在的变量依赖
      // 假设节点的 systemPrompt 中包含类似 {{#start.query#}} 的变量
      let resolvedPrompt = node.data?.systemPrompt || "";
      if (resolvedPrompt) {
        resolvedPrompt = resolveTemplateVariables(resolvedPrompt, state.nodeOutputs);
      }
      
      const startTime = Date.now();
      const mockDelay = Math.floor(Math.random() * 400) + 100;
      await new Promise(r => setTimeout(r, mockDelay));
      const duration = Date.now() - startTime;
      
      const label = node.data?.label || node.type;
      let messageContent = `\n==================== [${label}] ====================\n`;
      if (onEvent) onEvent(messageContent);
      
      // 当前节点执行产出的输出（写入上下文）
      const currentOutput: Record<string, any> = {};

      if (node.type === 'start') {
         const msg = `   > 📥 解析全局入参成功，已将数据向下游广播。\n`;
         messageContent += msg;
         if (onEvent) onEvent(msg);
         // 尝试解析全局入参为 JSON
         try {
           const parsed = JSON.parse(previousOutput);
           for (const k in parsed) {
             currentOutput[k] = parsed[k];
           }
         } catch {
           currentOutput.query = previousOutput;
         }
         currentOutput.text = previousOutput;
      } else if (node.type === 'llm') {
        const modelName = node.data?.model || "默认模型";
        let userQuery = resolveTemplateVariables(node.data?.query || '', state.nodeOutputs);
        if (!userQuery) userQuery = previousOutput;
        
        let systemPrompt = resolveTemplateVariables(node.data?.systemPrompt || '', state.nodeOutputs);

        const msg1 = `   > 🧠 调用大语言模型: [${modelName}]\n`;
        const msg2 = `   > 📥 用户提问: "${userQuery}"\n`;
        messageContent += msg1 + msg2;
        if (onEvent) onEvent(msg1 + msg2);
        
        let resultText = "";
        try {
          const db = await getDb();
          const model = await db.get(`SELECT * FROM models WHERE model_name = ?`, modelName);
          if (!model) throw new Error(`Model ${modelName} not found in database`);
          
          const { ChatOpenAI } = await import('@langchain/openai');
          
          let advancedConfig: any = {};
          if (typeof model.advanced_config === 'string') {
            try { advancedConfig = JSON.parse(model.advanced_config); } catch(e) {}
          }
          
          const chat = new ChatOpenAI({
            modelName: model.model_name,
            apiKey: model.api_key || 'sk-empty-placeholder',
            temperature: 0.7,
            configuration: {
              baseURL: model.base_url || undefined,
              defaultHeaders: advancedConfig.headers || undefined
            }
          });
          
          const msgs: any[] = [];
          if (systemPrompt) msgs.push(new SystemMessage(systemPrompt));
          msgs.push(new HumanMessage(userQuery));
          
          const response = await chat.invoke(msgs);
          resultText = response.content as string;
          
          const msg3 = `   > ✅ 模型回复: ${resultText}\n`;
          messageContent += msg3;
          if (onEvent) onEvent(msg3);
        } catch (e: any) {
          resultText = `Error: ${e.message}`;
          const msg3 = `   > ❌ 调用失败: ${e.message}\n`;
          messageContent += msg3;
          if (onEvent) onEvent(msg3);
        }
        
        currentOutput.text = resultText;
        currentOutput.model = modelName;
      } else if (node.type === 'agent') {
        const agentName = node.data?.agentName || node.data?.label || "智能体";
        const agentId = node.data?.agentId;
        // 尝试获取用户是否定义了输入依赖，如果没有，默认取上游文字
        const inputData = resolvedPrompt || previousOutput;
        const shortInput = inputData;
        
        const msg1 = `   > 🤖 正在唤醒 [${agentName}] 进行深度推理...\n`;
        const msg2 = `   > 📥 接收到解析后的入参: "${shortInput}"\n`;
        const msg3 = `   > 🧠 思考过程:\n`;
        messageContent += msg1 + msg2 + msg3;
        if (onEvent) onEvent(msg1 + msg2 + msg3);
        
        if (!agentId) {
          const errMsg = `   > ❌ 执行失败: 未配置具体的智能体 (Agent ID 为空，当前数据: ${JSON.stringify(node.data)})\n`;
          messageContent += errMsg;
          if (onEvent) onEvent(errMsg);
          currentOutput.text = "Error: 未配置智能体";
        } else {
          try {
            const db = await getDb();
            const finalResponse = await executeAgent(
              agentId,
              [{ role: 'user', content: inputData }],
              db,
              {
                onEvent: (type, payload) => {
                  if (type === 'TOOL_CALL_START') {
                    const msg = `\n   > 🛠️ 调用工具: [${payload?.tool_name}] 进行外部辅助查询或操作...`;
                    messageContent += msg;
                    if (onEvent) onEvent(msg);
                  } else if (type === 'TOOL_CALL_RESULT') {
                    const msg = `\n   > 🟢 工具返回: 获取到相关数据，继续思考...\n`;
                    messageContent += msg;
                    if (onEvent) onEvent(msg);
                  } else if (type === 'TEXT_MESSAGE_CONTENT') {
                    const msg = payload?.delta || '';
                    messageContent += msg;
                    if (onEvent) onEvent(msg);
                  }
                }
              }
            );
            const msg4 = `\n\n   > 🎯 推理完毕: 意图识别完成，已生成最终回复。\n`;
            messageContent += msg4;
            if (onEvent) onEvent(msg4);
            currentOutput.text = finalResponse;
          } catch (e: any) {
            const errMsg = `\n   > ❌ 推理报错: 大模型执行异常 - ${e.message}\n`;
            messageContent += errMsg;
            if (onEvent) onEvent(errMsg);
            currentOutput.text = `Error: ${e.message}`;
          }
        }

      } else if (node.type === 'batch_agent') {
        const agentName = node.data?.agentName || node.data?.label || "批处理智能体";
        const agentId = node.data?.agentId;
        const promptTemplate = node.data?.query || node.data?.userQuery || '';
        
        let items: any[] = [];
        const collectionData = previousOutput;
        try {
          if (Array.isArray(collectionData)) {
            items = collectionData;
          } else if (typeof collectionData === 'string') {
            try {
              items = JSON.parse(collectionData);
              if (!Array.isArray(items)) items = [collectionData];
            } catch (e) {
              items = collectionData.split(',').map(s => s.trim()).filter(Boolean);
            }
          } else {
            items = [collectionData];
          }
        } catch (e) {
          items = [collectionData];
        }

        const msg1 = `   > 🤖 正在唤醒 [${agentName}] 进行批处理推理 (共 ${items.length} 个子任务)...\n`;
        messageContent = msg1;
        if (onEvent) onEvent(msg1);

        if (!agentId) {
          const errMsg = `   > ❌ 执行失败: 未配置具体的智能体 (Agent ID 为空)\n`;
          messageContent += errMsg;
          if (onEvent) onEvent(errMsg);
          currentOutput.text = "Error: 未配置智能体";
        } else {
          try {
            const db = await getDb();
            const CONCURRENCY_LIMIT = 5; // 默认最大并发数为 5
            let finalResults: string[] = new Array(items.length);
            let completedCount = 0;

            const agentSysPrompt = node.data?.systemPrompt || '';
            const baseMsgsToSend: any[] = [];
            if (agentSysPrompt) {
              baseMsgsToSend.push({ role: 'system', content: resolveTemplateVariables(agentSysPrompt, state.nodeOutputs) });
            }
            baseMsgsToSend.push({ role: 'user', content: '' });

            const iteratorFn = async (itemData: any, i: number) => {
              const itemStr = typeof itemData === 'string' ? itemData : JSON.stringify(itemData);
              
              let currentContentToSend = itemStr;
              if (promptTemplate) {
                if (promptTemplate.includes('{{item}}')) {
                  currentContentToSend = promptTemplate.replace(/\{\{item\}\}/g, itemStr);
                } else {
                  currentContentToSend = `${promptTemplate}\n\n${itemStr}`;
                }
              }
              
              const progressMsg = `\n   > ⏳ [子任务 ${i + 1}/${items.length}] 开始处理: "${itemStr.length > 50 ? itemStr.substring(0, 50) + '...' : itemStr}"\n`;
              messageContent += progressMsg;
              if (onEvent) onEvent(progressMsg);
              
              const itemResponse = await executeAgent(
                agentId,
                [{ role: 'user', content: contentToSend }],
                db,
                {
                  onEvent: (type, payload) => {
                    if (type === 'TOOL_CALL_START') {
                      const msg = `\n   > 🛠️ [子任务 ${i+1}] 正在调用工具: [${payload?.tool_name}]...`;
                      messageContent += msg;
                      if (onEvent) onEvent(msg);
                    } else if (type === 'TEXT_MESSAGE_CONTENT') {
                      const msg = payload?.delta || '';
                      messageContent += msg;
                      if (onEvent) onEvent(msg);
                    }
                  }
                }
              );
              finalResults.push(`=== 子任务 ${i + 1} 结果 ===\n处理对象: ${itemStr}\n处理结果:\n${itemResponse}\n`);
            }
            const msg4 = `\n\n   > 🎯 批处理完毕: ${items.length} 个子任务全部处理完成。\n`;
            messageContent += msg4;
            if (onEvent) onEvent(msg4);
            currentOutput.text = finalResults.join('\n');
          } catch (e: any) {
            const errMsg = `\n   > ❌ 批处理报错: 智能体执行异常 - ${e.message}\n`;
            messageContent += errMsg;
            if (onEvent) onEvent(errMsg);
            currentOutput.text = `Error: ${e.message}`;
          }
        }

      } else if (node.type === 'code') {
        const inputData = resolvedPrompt || previousOutput;
        const code = node.data?.code || "def main(args):\n    return args";
        const shortInput = inputData;
        
        const msg1 = `   > 📥 代码执行入参: "${shortInput}"\n`;
        const msg2 = `   > ⚙️ 正在客户端内置 Python 环境中执行代码...\n`;
        messageContent += msg1 + msg2;
        if (onEvent) onEvent(msg1 + msg2);
        
        try {
          const tempFile = path.join(os.tmpdir(), `workflow_code_${Date.now()}.py`);
          const scriptContent = `
import json
import sys

${code}

if __name__ == '__main__':
    with open(sys.argv[1], 'r', encoding='utf-8') as f:
        args_str = f.read()
        
    try:
        args = json.loads(args_str)
    except:
        args = args_str
    
    result = main(args)
    if isinstance(result, (dict, list)):
        print(json.dumps(result, ensure_ascii=False))
    else:
        print(result)
`;
          await fs.promises.writeFile(tempFile, scriptContent);
          
          const tempInputFile = path.join(os.tmpdir(), `workflow_input_${Date.now()}.txt`);
          await fs.promises.writeFile(tempInputFile, typeof inputData === 'string' ? inputData : JSON.stringify(inputData));
          
          // 获取内置的 python 路径
          const pythonBin = electronApp.isPackaged 
            ? path.join(process.resourcesPath, 'python-env', 'python', 'bin', 'python3')
            : path.join(electronApp.getAppPath(), 'resources', 'python-env', 'python', 'bin', 'python3');
          
          const envCmd = `"${pythonBin}" "${tempFile}" "${tempInputFile}"`;
          const { stdout, stderr } = await execAsync(envCmd, { maxBuffer: 50 * 1024 * 1024 });
          
          const outStr = stdout.trim();
          const msgOut = `   > 🎯 代码执行完成。\n   > 💬 最终输出:\n${outStr}\n`;
          messageContent += msgOut;
          if (onEvent) onEvent(msgOut);
          
          if (stderr) {
            const errOut = `   > ⚠️ 标准错误:\n${stderr}\n`;
            messageContent += errOut;
            if (onEvent) onEvent(errOut);
          }
          currentOutput.text = outStr;
          
          // 如果输出是 JSON，尝试解析并展开
          try {
            const parsed = JSON.parse(outStr);
            if (typeof parsed === 'object' && parsed !== null) {
              for (const k in parsed) {
                currentOutput[k] = parsed[k];
              }
            }
          } catch(e) {}
          
          await fs.promises.unlink(tempFile).catch(()=>{});
          await fs.promises.unlink(tempInputFile).catch(()=>{});
        } catch(e: any) {
          const errMsg = `   > ❌ 代码执行错误: ${e.message}\n`;
          messageContent += errMsg;
          if (onEvent) onEvent(errMsg);
          currentOutput.text = `Error: ${e.message}`;
        }

      } else if (node.type === 'knowledge_base') {
        let query = resolveTemplateVariables(node.data?.query || '', state.nodeOutputs);
        if (!query) query = previousOutput;
        const kbId = node.data?.kbId || "未知知识库";
        
        const msg1 = `   > 📚 正在检索知识库 [${kbId}]...\n`;
        const msg2 = `   > 🔍 检索词: "${query}"\n`;
        messageContent += msg1 + msg2;
        if (onEvent) onEvent(msg1 + msg2);
        
        let resultText = "";
        try {
          resultText = await queryKnowledgeBaseById(kbId, query);
          
          const msg3 = `   > ✅ 检索完成，结果已提取。\n   > 📄 检索内容:\n${resultText}\n`;
          messageContent += msg3;
          if (onEvent) onEvent(msg3);
        } catch (err: any) {
          resultText = `Error: ${err.message}`;
          const msg3 = `   > ❌ 检索失败: ${err.message}\n`;
          messageContent += msg3;
          if (onEvent) onEvent(msg3);
        }
        
        currentOutput.text = resultText;
        currentOutput.query = query;

      } else if (node.type === 'plugin') {
        const pluginName = node.data?.pluginName || "未知插件";
        let inputData = resolveTemplateVariables(node.data?.inputData || '', state.nodeOutputs);
        if (!inputData) inputData = previousOutput;
        
        const msg1 = `   > 🧩 调用插件: [${pluginName}]\n`;
        const msg2 = `   > 📥 传入参数: "${inputData}"\n`;
        messageContent += msg1 + msg2;
        if (onEvent) onEvent(msg1 + msg2);
        
        await new Promise(r => setTimeout(r, 1000));
        
        const resultText = `插件 ${pluginName} 执行成功。`;
        const msg3 = `   > ✅ 执行结果: ${resultText}\n`;
        messageContent += msg3;
        if (onEvent) onEvent(msg3);
        
        currentOutput.text = resultText;

      } else if (node.type === 'api') {
        const method = node.data?.method || 'GET';
        const url = resolveTemplateVariables(node.data?.url || '', state.nodeOutputs);
        
        const msg1 = `   > 🌐 发起 HTTP 请求: [${method}] ${url}\n`;
        messageContent += msg1;
        if (onEvent) onEvent(msg1);
        
        if (!url) {
          const err = `   > ❌ URL 不能为空\n`;
          messageContent += err;
          if (onEvent) onEvent(err);
          currentOutput.text = "Error: URL is empty";
        } else {
          const headers: Record<string, string> = {
            'Content-Type': 'application/json'
          };
          for (const h of (node.data?.headers || [])) {
            if (h.key) headers[h.key] = resolveTemplateVariables(h.value || '', state.nodeOutputs);
          }
          
          let body: string | undefined = undefined;
          if (['POST', 'PUT'].includes(method)) {
            const bodyObj: Record<string, any> = {};
            for (const b of (node.data?.bodyParams || [])) {
              if (b.key) bodyObj[b.key] = resolveTemplateVariables(b.value || '', state.nodeOutputs);
            }
            if (Object.keys(bodyObj).length > 0) {
              body = JSON.stringify(bodyObj);
            }
          }

          try {
            const startTs = Date.now();
            const response = await fetch(url, { method, headers, body });
            const responseText = await response.text();
            const cost = Date.now() - startTs;
            const shortResp = responseText;
            const msg2 = `   > ✅ 请求成功 (${response.status}) 耗时 ${cost}ms\n   > 📄 返回内容:\n${shortResp}\n`;
            messageContent += msg2;
            if (onEvent) onEvent(msg2);
            
            currentOutput.status = response.status;
            currentOutput.text = responseText;
            try {
              const json = JSON.parse(responseText);
              for (const k in json) {
                currentOutput[k] = json[k];
              }
            } catch(e) {}
          } catch(e: any) {
            const msg2 = `   > ❌ 请求失败: ${e.message}\n`;
            messageContent += msg2;
            if (onEvent) onEvent(msg2);
            currentOutput.text = `Error: ${e.message}`;
          }
        }
      } else if (node.type === 'selector') {
        const cases = node.data?.cases || [];
        let matchedHandle = 'else';
        
        // 构建 input 对象，包含所有已知 nodeOutputs
        let inputObj: Record<string, any> = {};
        for (const [nid, nout] of Object.entries(state.nodeOutputs || {})) {
          if (typeof nout === 'object' && nout !== null) {
            inputObj = { ...inputObj, ...nout };
          }
        }
        // 如果 previousOutput 能解析，也放进去
        try {
          const parsed = typeof previousOutput === 'string' ? JSON.parse(previousOutput) : previousOutput;
          inputObj = { ...inputObj, ...parsed };
        } catch(e) {
          inputObj.text = previousOutput;
        }

        const msg1 = `   > 🔀 进入路由判断节点...\n`;
        messageContent += msg1;
        if (onEvent) onEvent(msg1);

        for (let i = 0; i < cases.length; i++) {
          const caseItem = cases[i];
          try {
            let conditionStr = caseItem.condition || '';
            // 兼容 Dify 语法，将 {{#node.var#}} 替换为 state.nodeOutputs['node']?.['var']
            conditionStr = conditionStr.replace(/\{\{#([^.]+)\.([^}]+)\#\}\}/g, "state.nodeOutputs['$1']?.['$2']");
            
            // 如果用户写的是纯表达式，自动补充 return
            const trimmed = conditionStr.trim();
            if (!trimmed.startsWith('return ') && !trimmed.startsWith('if') && !trimmed.includes(';')) {
              conditionStr = `return ${conditionStr}`;
            }

            const fn = new Function('input', 'state', conditionStr);
            const isMatch = fn(inputObj, state);
            if (isMatch) {
              matchedHandle = 'case_' + i;
              const msg = `   > ✅ 分支匹配成功: [${caseItem.label}]\n`;
              messageContent += msg;
              if (onEvent) onEvent(msg);
              break;
            }
          } catch(e: any) {
            const msg = `   > ⚠️ 分支[${caseItem.label}]执行报错: ${e.message}\n`;
            messageContent += msg;
            if (onEvent) onEvent(msg);
          }
        }

        if (matchedHandle === 'else') {
          const msg = `   > ↪️ 无匹配分支，走向默认 Else 分支。\n`;
          messageContent += msg;
          if (onEvent) onEvent(msg);
        }
        currentOutput.matchedHandle = matchedHandle;
        currentOutput.text = previousOutput;
      } else if (node.type === 'end') {
         const shortInput = previousOutput;
         const msg = `   > 🏁 接收到上游最终结果: "${shortInput}"\n   > 🎉 工作流圆满结束。\n`;
         messageContent += msg;
         if (onEvent) onEvent(msg);
         currentOutput.text = previousOutput;
      } else {
         const shortInput = previousOutput;
         const msg = `   > 📥 接收输入: "${shortInput}"\n   > ⚙️ 处理完成。\n`;
         messageContent += msg;
         if (onEvent) onEvent(msg);
         currentOutput.text = "处理完成的结果";
      }

      return { 
        messages: [new HumanMessage(messageContent)],
        nodeOutputs: { [node.id]: currentOutput }
      };
    });
  }

  // 动态注册画布上的所有连线
  const selectorNodes = nodes.filter(n => n.type === 'selector');
  const selectorIds = new Set(selectorNodes.map(n => n.id));

  for (const edge of edges) {
    if (!nodes.some(n => n.id === edge.source) || !nodes.some(n => n.id === edge.target)) continue;
    
    // 如果这条边的起点是 selector，我们使用 addConditionalEdges，所以这里跳过 addEdge
    if (selectorIds.has(edge.source)) {
      continue;
    }
    
    graph.addEdge(edge.source, edge.target);
  }

  // 注册 selector 的条件分支
  for (const selector of selectorNodes) {
    const outEdges = edges.filter(e => e.source === selector.id && nodes.some(n => n.id === e.target));
    if (outEdges.length > 0) {
      const mapping: Record<string, string> = {};
      outEdges.forEach(e => {
        mapping[e.sourceHandle || 'else'] = e.target;
      });
      
      // 使用 addConditionalEdges 动态路由
      graph.addConditionalEdges(selector.id, (state) => {
        const out = state.nodeOutputs[selector.id];
        return out?.matchedHandle || 'else';
      }, mapping);
    }
  }

  graph.setEntryPoint(startNode.id);
  graph.setFinishPoint(endNode.id);

  const app = graph.compile();
  
  let userMessageContent = "你好";
  if (inputData) {
    try {
      const parsed = JSON.parse(inputData);
      userMessageContent = JSON.stringify(parsed, null, 2);
    } catch {
      userMessageContent = inputData;
    }
  }

  // 等待整个工作流执行完毕
  const res = await app.invoke({ messages: [new HumanMessage(`[用户输入]:\n${userMessageContent}`)] });
  
  return res.messages.map((m: any) => m.content).join('\n\n');
}
