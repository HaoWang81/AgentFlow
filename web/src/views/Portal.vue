<script setup lang="ts">
import Navbar from '../components/Navbar.vue'
import { Bot, Sparkles, Code2, Cpu, Zap, Search } from 'lucide-vue-next'

const templates = [
  { id: 1, title: '小红书爆款文案生成器', desc: '根据关键词自动生成符合小红书网感、带Emoji的爆款图文笔记。', icon: Sparkles, color: 'text-pink-500', bg: 'bg-pink-100', uses: '1.2w' },
  { id: 2, title: '企业内部知识库问答', desc: '基于 RAG 技术，一键对接企业文档库，自动回答内部员工常见问题。', icon: Search, color: 'text-blue-500', bg: 'bg-blue-100', uses: '8.5k' },
  { id: 3, title: 'GitHub PR Code Review', desc: '监听 GitHub Webhook，自动拉取代码变更并使用大模型进行深度 Review。', icon: Code2, color: 'text-gray-700', bg: 'bg-gray-100', uses: '5.3k' },
]

const agents = [
  { id: 1, name: '数据分析专家', role: '分析师', desc: '内置 Pandas 和 Echarts 插件，上传 Excel 自动输出可视化图表。', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Data' },
  { id: 2, name: '市场调研助手', role: '研究员', desc: '自动调用搜索引擎 API 抓取竞品动态并生成深度对比分析报告。', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Market' },
]
</script>

<template>
  <div class="min-h-screen bg-[#f8fafc] flex flex-col font-sans overflow-x-hidden">
    <Navbar />

    <main class="flex-1 w-full pb-20">
      <!-- Hero Section -->
      <section class="relative pt-24 pb-28 flex flex-col items-center justify-center text-center px-4 overflow-hidden">
        <!-- Background decorative elements -->
        <div class="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full overflow-hidden -z-10 pointer-events-none">
          <div class="absolute -top-[30%] -left-[10%] w-[50%] h-[80%] rounded-full bg-gradient-to-br from-blue-100/40 to-indigo-100/40 blur-3xl"></div>
          <div class="absolute top-[20%] -right-[10%] w-[40%] h-[60%] rounded-full bg-gradient-to-bl from-purple-100/40 to-pink-100/40 blur-3xl"></div>
        </div>

        <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-sm font-medium mb-8">
          <Zap :size="16" class="fill-current" /> 全新工作流调度引擎现已上线
        </div>
        
        <h1 class="text-5xl md:text-7xl font-extrabold text-slate-900 mb-8 tracking-tight max-w-4xl leading-tight">
          将 <span class="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">AI 能力</span> 编排为<br/>业务生产力引擎
        </h1>
        <p class="text-xl text-slate-500 mb-12 max-w-2xl mx-auto leading-relaxed">
          极致可视化的多智能体编排平台。无需繁琐编码，轻松将大型语言模型、外部 API 与自定义逻辑组件组装成复杂的自动化工作流。
        </p>
        
        <div class="flex flex-col sm:flex-row justify-center gap-4 w-full px-4">
          <router-link to="/console/workflows" class="px-8 py-3.5 bg-blue-600 text-white text-lg font-semibold rounded-xl hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-200 transition-all flex items-center justify-center gap-2">
            进入控制台 <span class="text-blue-200">&rarr;</span>
          </router-link>
          <a href="#" class="px-8 py-3.5 bg-white text-slate-700 text-lg font-semibold rounded-xl border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm flex items-center justify-center">
            阅读开发文档
          </a>
        </div>
      </section>

      <!-- Templates Section -->
      <section class="max-w-6xl mx-auto px-6 mb-20">
        <div class="flex items-center justify-between mb-8">
          <div>
            <h2 class="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Sparkles class="text-amber-500" /> 探索公共工作流
            </h2>
            <p class="text-slate-500 mt-1">一键复用优质的工作流模板，快速启动您的业务场景。</p>
          </div>
          <a href="#" class="text-sm font-medium text-blue-600 hover:text-blue-700">查看全部模板 &rarr;</a>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div v-for="tpl in templates" :key="tpl.id" class="bg-white rounded-2xl p-6 border border-slate-200 hover:border-blue-300 hover:shadow-lg transition-all cursor-pointer group">
            <div class="flex justify-between items-start mb-4">
              <div :class="['w-12 h-12 rounded-xl flex items-center justify-center', tpl.bg, tpl.color]">
                <component :is="tpl.icon" :size="24" />
              </div>
              <span class="inline-flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                <Cpu :size="12" /> {{ tpl.uses }} 次使用
              </span>
            </div>
            <h3 class="text-lg font-bold text-slate-900 mb-2 group-hover:text-blue-600 transition-colors">{{ tpl.title }}</h3>
            <p class="text-sm text-slate-500 line-clamp-2 leading-relaxed">{{ tpl.desc }}</p>
          </div>
        </div>
      </section>

      <!-- Agent Eco Section -->
      <section class="max-w-6xl mx-auto px-6 mb-10">
        <div class="flex items-center justify-between mb-8">
          <div>
            <h2 class="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Bot class="text-indigo-500" /> 智能体广场
            </h2>
            <p class="text-slate-500 mt-1">发现和集成各种封装了特定人设与专属工具的 Agent 模块。</p>
          </div>
          <a href="#" class="text-sm font-medium text-blue-600 hover:text-blue-700">进入广场 &rarr;</a>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div v-for="agent in agents" :key="agent.id" class="bg-gradient-to-r from-white to-slate-50 rounded-2xl p-6 border border-slate-200 flex gap-5 hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer">
            <img :src="agent.avatar" alt="Agent Avatar" class="w-16 h-16 rounded-2xl bg-white border border-slate-100 shadow-sm" />
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-1">
                <h3 class="text-lg font-bold text-slate-900">{{ agent.name }}</h3>
                <span class="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">{{ agent.role }}</span>
              </div>
              <p class="text-sm text-slate-500 leading-relaxed">{{ agent.desc }}</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
