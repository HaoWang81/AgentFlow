const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

(async () => {
  const dbPath = path.join(require('os').homedir(), 'Library/Application Support/web/antigravity_workflow.db');
  console.log('Connecting to database:', dbPath);
  
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  const toolName = 'process_order_excel';
  const description = '动态读取并利用大模型分析用户上传的包含上/下公差的样件报告Excel文件，提取表格结构并在对应位置填充生成的随机值与指定订单号，最后返回生成的多份Excel文件链接。';
  
  const parameters = JSON.stringify({
    type: 'object',
    properties: {
      order_numbers: {
        type: 'string',
        description: '以逗号分隔的订单号列表，例如: "product-1,product-2,product-3"'
      },
      file_path: {
        type: 'string',
        description: '用户上传的Excel文件的相对路径，通常以 /memories/ 开头'
      }
    },
    required: ['order_numbers', 'file_path']
  });

  // IMPORTANT: This is the code that will run IN THE SANDBOX (Agent Execution Environment)
  const code = `
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');

let userDataPath = process.cwd();
try {
  const { app } = require('electron');
  if (app) userDataPath = app.getPath('userData');
} catch(e) {}

const memoriesRoot = path.join(userDataPath, 'memories');
const dbPath = path.join(userDataPath, 'antigravity_workflow.db');

if (!args.file_path) return "错误：未提供 file_path";
if (!args.order_numbers) return "错误：未提供 order_numbers";

const orderNumbers = args.order_numbers.split(',').map(s => s.trim()).filter(Boolean);
if (orderNumbers.length === 0) return "错误: 没有提供有效的订单号";

const relativePath = args.file_path.startsWith('/memories/') ? args.file_path.substring(10) : args.file_path;
const absolutePath = path.join(memoriesRoot, relativePath);

if (!fs.existsSync(absolutePath)) {
    return "错误: 找不到上传的 Excel 文件: " + absolutePath + " (传入参数为: " + args.file_path + ")";
}

let workbook;
try {
    workbook = xlsx.readFile(absolutePath);
} catch(e) {
    return "错误: 无法解析 Excel 文件。可能是格式不受支持或文件损坏：" + e.message;
}

// 找数据量最多的表，或者包含 'MAX' / 'MIN' / '公差' 等字眼的表
let targetSheetName = workbook.SheetNames[0];
let data = [];
for (const sn of workbook.SheetNames) {
    const snData = xlsx.utils.sheet_to_json(workbook.Sheets[sn], { header: 1 });
    const snDataStr = JSON.stringify(snData.slice(0, 20)).toUpperCase();
    if (snDataStr.includes('MAX') || snDataStr.includes('MIN') || snDataStr.includes('公差')) {
        targetSheetName = sn;
        data = snData;
        break;
    }
}
if (data.length === 0) data = xlsx.utils.sheet_to_json(workbook.Sheets[targetSheetName], { header: 1 });
if (data.length < 2) return "错误: Excel 文件为空或没有数据行";

// 连接数据库获取默认 LLM 凭证
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

let modelRow = null;
try {
    const db = await open({ filename: dbPath, driver: sqlite3.Database });
    modelRow = await db.get('SELECT * FROM models ORDER BY is_default DESC, id ASC LIMIT 1');
    await db.close();
} catch (e) {
    console.error('无法读取本地模型配置', e);
}

if (!modelRow) return "错误: 数据库中没有配置可用的大模型";

const { ChatOpenAI } = require('@langchain/openai');
let apiKey = modelRow.api_key;
if (!apiKey || apiKey === 'sk-empty-placeholder') {
    apiKey = process.env.OPENAI_API_KEY || 'sk-empty-placeholder';
}

const llm = new ChatOpenAI({
    apiKey: apiKey,
    configuration: { baseURL: modelRow.base_url || undefined },
    modelName: modelRow.model_name,
    temperature: 0
});

const promptText = \`
请分析以下 Excel 表格（前30行）的结构，行和列索引均从 0 开始。
我们需要找到两个重要的结构部分：
1. "物料号" / "订单号" / "炉批号" 等类似字段对应的实际数值所在的单元格位置（一个具体的行号和列号，不要取表头名的坐标，要取填写内容的那个格子的坐标，比如包含一串数字的那个单元格）。
2. 检测数据表（可能有左右拆分两栏，如果是请分别找出）。对于每一个子表，请找到：
   - dataStartRow: 正式填检测数据的第一行行号
   - maxCol: "MAX" 或 "上公差" 所在的列号
   - minCol: "MIN" 或 "下公差" 所在的列号
   - randomCol: 用来填实测结果所在的列号（比如 "Part 1" 或者空白列）

请严格输出 JSON，不要有任何 Markdown 包裹或其他废话，格式如下：
{
  "materialCell": {"row": 4, "col": 9},
  "tables": [
    {"dataStartRow": 7, "maxCol": 2, "minCol": 3, "randomCol": 5},
    {"dataStartRow": 7, "maxCol": 13, "minCol": 14, "randomCol": 16}
  ]
}

Excel 原始数据前 30 行（二维数组）：
\${JSON.stringify(data.slice(0, 30))}
\`;

let struct;
try {
    const response = await llm.invoke(promptText);
    let rawContent = response.content.trim();
    if (rawContent.startsWith('\`\`\`json')) rawContent = rawContent.substring(7);
    if (rawContent.startsWith('\`\`\`')) rawContent = rawContent.substring(3);
    if (rawContent.endsWith('\`\`\`')) rawContent = rawContent.substring(0, rawContent.length - 3);
    struct = JSON.parse(rawContent);
} catch(e) {
    return "错误: 大模型结构分析失败: " + e.message;
}

if (!struct || !struct.tables || struct.tables.length === 0) {
    return "错误: 大模型未能在样板中找到有效的表格结构数据。返回内容：" + JSON.stringify(struct);
}

function getDecimals(numStr) {
    const s = String(numStr);
    if (s.includes('.')) return s.split('.')[1].length;
    return 0;
}

const ExcelJS = require('exceljs');

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(absolutePath);
const ws = wb.getWorksheet(targetSheetName);

if (ws) {
    const orderStr = orderNumbers.join(', ');
    // 替换物料号/订单号单元格 (exceljs 坐标从 1 开始)
    if (struct.materialCell) {
        const r = struct.materialCell.row + 1;
        const c = struct.materialCell.col + 1;
        ws.getCell(r, c).value = orderStr;
    }

    // 处理检测数据表格
    for (const table of struct.tables) {
        for (let r = table.dataStartRow; r < data.length; r++) {
            const row = data[r];
            if (!row || row.length === 0) continue;
            
            let upStr = row[table.maxCol];
            let downStr = row[table.minCol];
            
            if (upStr !== undefined && downStr !== undefined && upStr !== '' && downStr !== '') {
                let up = parseFloat(upStr);
                let down = parseFloat(downStr);
                if (!isNaN(up) && !isNaN(down)) {
                    let decUp = getDecimals(upStr);
                    let decDown = getDecimals(downStr);
                    let decimals = Math.max(decUp, decDown, 2); 
                    
                    if (down > up) { let t = up; up = down; down = t; }
                    let randomVal = Math.random() * (up - down) + down;
                    let finalVal = Number(randomVal.toFixed(decimals));
                    
                    const cellRow = r + 1;
                    const cellCol = table.randomCol + 1;
                    ws.getCell(cellRow, cellCol).value = finalVal;
                }
            }
        }
    }
    await wb.xlsx.writeFile(absolutePath);
}

// 返回原文件的路径，这里要针对前端可能需要的格式进行编码，但尽量只编码最后的文件名以保持路径正确
const encodedRelative = args.file_path.split('/').map(s => encodeURIComponent(s)).join('/');
return "处理成功！已基于上传的附件直接完成了填充：" + JSON.stringify(struct) + "\\n\\n- [点击查看原附件更新](" + encodedRelative + ")";
  `;

  await db.run(
    'INSERT INTO tools (name, description, parameters, code) VALUES (?, ?, ?, ?)',
    [toolName, description, parameters, code]
  );

  console.log('✅ Tool inserted successfully!');
  await db.close();
})();
