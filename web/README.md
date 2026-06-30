<div align="center">

# AgentFlow 🤖

*A powerful desktop platform for orchestrating local AI multi-agent workflows.*<br>
*一款强大的桌面级本地 AI 多智能体工作流编排平台。*

[![Vue 3](https://img.shields.io/badge/Vue.js-3.0-4FC08D?logo=vue.js)](https://vuejs.org/)
[![Electron](https://img.shields.io/badge/Electron-Desktop-47848F?logo=electron)](https://www.electronjs.org/)
[![LangChain](https://img.shields.io/badge/LangChain-AI-1C3C3C?logo=chainlink)](https://js.langchain.com/)
[![TailwindCSS v4](https://img.shields.io/badge/TailwindCSS-v4-38B2AC?logo=tailwind-css)](https://tailwindcss.com/)

[English](#english) | [简体中文](#简体中文)

</div>

---

<h2 id="简体中文">🇨🇳 简体中文</h2>

**AgentFlow** 是一款先进的跨平台桌面应用，专为构建、编排和执行“多智能体（Multi-Agent）AI 工作流”而设计。通过将大语言模型（LLM）与本地文件系统、自定义工具进行深度集成，让 AI 真正拥有在本地系统安全执行复杂任务的能力。

无论是自动化处理复杂的数据物料（例如：根据样板精准提取和修改 `.xlsx` 文件中的公差并保留所有原有样式），还是接入外部工具，AgentFlow 都为你提供了一个隔离、安全的沙箱执行环境。

### ✨ 核心特性

- 🧩 **可视化工作流编排**：利用拖拽式流程图（VueFlow）直观管理智能体及其调度逻辑。
- 🛡️ **安全的本地沙箱执行**：所有的动态脚本与自动化工具解析，都在高度安全的 Node.js 沙箱环境中执行，绝不影响系统安全。
- 🔌 **支持 MCP (模型上下文协议)**：天生具备极高的可扩展性，只需简单配置，即可无缝接入各类外部 MCP Servers 和本地知识库。
- 🚀 **极致性能体验**：基于经过深度优化的 Vite + Vue 3 渲染引擎，配合 Electron 提供丝滑的原生桌面应用手感。
- 🔒 **本地隐私与持久化**：内置本地 SQLite 数据库，聊天记录、智能体配置和上传的文件统统保存在本地（`~/Library/Application Support/web/`），让你的隐私 100% 留存在自己手中。

### 🛠️ 技术栈

- **前端架构**：Vue 3 + Vite + TailwindCSS v4
- **桌面框架**：Electron
- **核心 AI 框架**：LangChain (JS/TS) + `@modelcontextprotocol/sdk`
- **本地存储**：SQLite (sqlite3) + Express 静态服务托管

### 📦 快速开始

**1. 克隆项目并安装依赖：**
```bash
git clone git@github.com:HaoWang81/AgentFlow.git
cd AgentFlow/web
npm install
```

**2. 启动本地开发服务：**
```bash
npm run dev
```

**3. 构建可执行程序 (Mac/Win)：**
```bash
# 构建 Mac dmg 包
npm run build:mac

# 构建 Windows 安装包
npm run build:win
```

---

<br>

<h2 id="english">🇬🇧 English</h2>

**AgentFlow** is an advanced, cross-platform desktop engine designed for building, orchestrating, and executing multi-agent AI workflows. It empowers users to seamlessly integrate LLMs with local file systems and custom tools, turning conceptual AI interactions into real-world local task executions.

From automating complex data processing (like extracting and filling dynamic `.xlsx` files while retaining all original styles) to chaining multiple intelligent agents for robust local tasks, AgentFlow provides a secure, sandboxed environment combined with cutting-edge Model Context Protocol (MCP) integrations.

### ✨ Key Features

- 🧩 **Visual Workflow Orchestration:** Effortlessly design and manage intelligent agents and task flows using a visual node-based editor (VueFlow).
- 🛡️ **Secure Local Sandboxing:** Dynamically generated scripts and automated parsers are executed in an isolated Node.js environment.
- 🔌 **MCP Integration:** Fully compatible with the Model Context Protocol, enabling extensible connections to external services and custom AI tools.
- 🚀 **High Performance:** Powered by Vite and Vue 3 to deliver a buttery-smooth desktop experience through Electron.
- 🔒 **100% Local Privacy:** Utilizes an embedded SQLite database (`~/Library/Application Support/web/`). Your agent configurations, chats, and uploaded files never leave your machine.

### 🛠️ Tech Stack

- **Frontend:** Vue 3 + Vite + TailwindCSS v4
- **Desktop Container:** Electron
- **AI Framework:** LangChain (JS/TS) + `@modelcontextprotocol/sdk`
- **Local Storage:** SQLite (sqlite3) & Express 

### 📦 Getting Started

**1. Clone & Install:**
```bash
git clone git@github.com:HaoWang81/AgentFlow.git
cd AgentFlow/web
npm install
```

**2. Start Development Server:**
```bash
npm run dev
```

**3. Build Desktop Application:**
```bash
# Build for Mac (.dmg)
npm run build:mac

# Build for Windows (.exe)
npm run build:win
```
