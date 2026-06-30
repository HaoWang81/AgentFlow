<script setup lang="ts">
import { ChevronDown, User, LogOut, Settings, Trash2 } from 'lucide-vue-next'
import { ref } from 'vue'
import { Message } from '../utils/message'

const showDropdown = ref(false)
const closeDropdown = () => setTimeout(() => { showDropdown.value = false }, 200)

const clearAllCache = async () => {
  try {
    const res = await fetch('/api/memory/clear-all', { method: 'DELETE' })
    const data = await res.json()
    if (data.success) {
      Message.success('已清空所有智能体的本地缓存数据')
    } else {
      Message.error('清理缓存失败')
    }
  } catch (err) {
    Message.error('网络请求失败')
  }
}
</script>

<template>
  <header class="app-region-drag h-14 bg-white/80 backdrop-blur-md border-b border-gray-200 flex items-center justify-between px-6 sticky top-0 z-50">
    <div class="flex items-center gap-8">
      <router-link to="/" class="flex items-center gap-2 hover:opacity-80 transition">
        <img src="/logo.png" alt="WH Logo" class="h-8 w-auto object-contain" />
        <h1 class="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600">WH Agent Flow</h1>
      </router-link>
      
      <nav class="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600">
        <router-link to="/" class="hover:text-blue-600 transition" active-class="text-blue-600" exact-active-class="text-blue-600">探索发现</router-link>
        <a href="#" class="hover:text-blue-600 transition">解决方案</a>
        <a href="#" class="hover:text-blue-600 transition">价格</a>
        <a href="#" class="hover:text-blue-600 transition">开发文档</a>
      </nav>
    </div>

    <div class="flex items-center gap-4">
      <router-link to="/console/workflows" class="text-sm font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 px-4 py-1.5 rounded-full border border-blue-100 hover:bg-blue-100 transition shadow-sm">
        进入控制台
      </router-link>
      
      <div class="relative">
        <button 
          @click="showDropdown = !showDropdown" 
          @blur="closeDropdown"
          class="flex items-center gap-2 p-1 rounded-full hover:bg-gray-100 transition border border-transparent hover:border-gray-200"
        >
          <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="Avatar" class="w-7 h-7 rounded-full border border-gray-200 bg-gray-50" />
          <ChevronDown :size="16" class="text-gray-500 hidden sm:block" />
        </button>

        <!-- Dropdown -->
        <div v-if="showDropdown" class="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50 overflow-hidden transform opacity-100 scale-100 transition-all">
          <div class="px-4 py-3 border-b border-gray-50 bg-gray-50/50">
            <p class="text-sm font-medium text-gray-900 truncate">wanghao@example.com</p>
            <p class="text-xs text-gray-500 truncate mt-0.5">超级管理员</p>
          </div>
          <router-link to="/console/workflows" class="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition">
            <User :size="16" /> 我的控制台
          </router-link>
          <a href="#" class="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition">
            <Settings :size="16" /> 账户设置
          </a>
          <a href="#" @click.prevent="clearAllCache" class="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition">
            <Trash2 :size="16" /> 清理全局缓存
          </a>
          <div class="h-px bg-gray-100 my-1"></div>
          <a href="#" class="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition">
            <LogOut :size="16" /> 退出登录
          </a>
        </div>
      </div>
    </div>
  </header>
</template>
