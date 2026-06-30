<script setup lang="ts">
import { LayoutDashboard, Network, Bot, Settings, ChevronLeft, Package } from 'lucide-vue-next'
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <div class="h-screen w-screen flex bg-gray-50 overflow-hidden">
    <!-- Console Sidebar -->
    <aside class="w-64 bg-white border-r border-gray-200 flex flex-col z-20 shadow-sm relative">
      <div class="h-8 w-full bg-white shrink-0" style="-webkit-app-region: drag"></div>
      <div class="app-region-drag h-14 flex items-center px-4 border-b border-gray-100 mb-6 bg-white justify-between">
        <div class="flex items-center gap-2">
          <img src="/logo.png" alt="WH Logo" class="h-6 w-auto object-contain" />
          <span class="font-bold text-gray-800 text-sm tracking-wide">WH Flow</span>
        </div>
        <router-link to="/" class="text-gray-400 hover:text-blue-600 transition bg-gray-50 hover:bg-gray-100 p-1 rounded-md" title="返回门户主页">
          <ChevronLeft :size="16" />
        </router-link>
      </div>

      <div class="px-4">
        <div class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-2">空间资产</div>
        <nav class="flex-1 px-4 py-6 space-y-1">
          <router-link to="/console/workflows" class="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition" :class="[route.path.includes('/console/workflows') ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900']">
            <Network :size="18" />
            工作流编排
          </router-link>
          <router-link to="/console/agents" class="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition" :class="[route.path.includes('/console/agents') ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900']">
            <Bot :size="18" />
            智能体引擎
          </router-link>
          <router-link to="/console/resources" class="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition" :class="[route.path.includes('/console/resources') ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900']">
            <Package :size="18" />
            资源中心
          </router-link>
        </nav>
      </div>

      <div class="mt-auto px-4 pb-6">
        <div class="h-px bg-gray-100 my-4 mx-2"></div>
        <a href="#" class="flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition">
          <Settings :size="18" /> 空间设置
        </a>
      </div>
    </aside>

    <!-- Main Content Area -->
    <main class="flex-1 flex flex-col overflow-hidden bg-[#fbfcfd] relative">
      <router-view />
    </main>
  </div>
</template>
