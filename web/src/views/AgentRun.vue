<template>
  <div class="h-screen w-screen bg-slate-900 text-slate-100 flex flex-col font-sans overflow-hidden">
    <div class="h-8 w-full shrink-0" style="-webkit-app-region: drag"></div>
    <!-- Header -->
    <header class="app-region-drag flex items-center justify-between px-6 py-4 bg-slate-800/50 backdrop-blur border-b border-slate-700">
      <div class="flex items-center gap-3" style="-webkit-app-region: no-drag">
        <div class="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <Bot class="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 class="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">{{ agent.name || 'AI Assistant' }}</h1>
          <p class="text-xs text-slate-400 flex items-center gap-1">
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Online
          </p>
        </div>
      </div>
      <button @click="handleExit" class="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-slate-700 transition-colors text-sm font-medium" style="-webkit-app-region: no-drag">
        <Loader2 v-if="isExiting" class="w-4 h-4 animate-spin" />
        <LogOut v-else class="w-4 h-4" /> 
        {{ isExiting ? '正在保存...' : '退出运行' }}
      </button>
    </header>

    <!-- Main Content -->
    <main class="flex-1 flex flex-col md:flex-row overflow-hidden relative">
      <!-- Video Section (Left) -->
      <section v-if="agent.enable_video !== 0" class="w-full md:w-1/3 border-b md:border-b-0 md:border-r border-slate-700 bg-slate-800/30 flex flex-col items-center justify-center p-4 relative group">
        <div class="relative w-full aspect-video rounded-2xl overflow-hidden bg-slate-900 shadow-2xl ring-1 ring-white/10">
          <video ref="videoRef" class="w-full h-full object-cover transform scale-x-[-1]" autoplay playsinline muted></video>
          
          <!-- Camera Overlay -->
          <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex flex-col justify-end p-4">
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium px-2 py-1 bg-black/50 backdrop-blur rounded text-white flex items-center gap-2">
                <Camera class="w-3 h-3" /> 用户镜头
              </span>
              <button @click="toggleCamera" class="p-2 rounded-full backdrop-blur transition-all shadow-lg" :class="isCameraOn ? 'bg-emerald-500 text-white shadow-emerald-500/50' : 'bg-slate-600 text-slate-300 hover:bg-slate-500'">
                <Video v-if="isCameraOn" class="w-5 h-5" />
                <VideoOff v-else class="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- Chat Section (Right) -->
      <section class="flex-1 flex flex-col bg-slate-900/50 relative">
        <!-- Messages Area -->
        <div class="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth" ref="chatContainerRef">
          <div v-for="(msg, i) in chatMessages" :key="i" 
               v-show="getMessageContent(msg) !== '' || (msg.segments && msg.segments.some((s: any) => s.type !== 'text'))"
               class="flex gap-4" 
               :class="msg.role === 'user' ? 'flex-row-reverse' : ''">
            <!-- Avatar -->
            <div class="w-8 h-8 rounded-full flex items-center justify-center shrink-0" :class="msg.role === 'user' ? 'bg-indigo-500' : 'bg-purple-600'">
              <User v-if="msg.role === 'user'" class="w-5 h-5 text-white" />
              <Bot v-else class="w-5 h-5 text-white" />
            </div>
            
            <!-- Message Bubble -->
            <div class="min-w-0" style="max-width: 80%;">
              <div class="px-4 py-3 rounded-2xl shadow-sm space-y-2 overflow-hidden" :class="msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-sm' : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-tl-sm'">
                <template v-for="(seg, sIdx) in msg.segments" :key="sIdx">
                  <div v-if="seg.type === 'text'" class="prose prose-invert prose-sm max-w-full min-w-0 break-words overflow-x-auto" v-html="renderMarkdown(seg.content)"></div>
                  <img v-else-if="seg.type === 'image'" :src="seg.base64" class="max-h-32 w-auto rounded border border-slate-600/50 object-cover" />
                  
                  <!-- Tool Call UI -->
                  <div v-else-if="seg.type === 'tool'" class="text-xs font-mono bg-slate-900/50 rounded-lg p-2.5 border border-slate-700 overflow-hidden">
                    <div class="flex items-center gap-2" :class="seg.done ? 'text-emerald-400' : 'text-indigo-400'">
                      <Loader2 v-if="!seg.done" class="w-3.5 h-3.5 animate-spin shrink-0" />
                      <Wrench v-else class="w-3.5 h-3.5 shrink-0" />
                      <span class="font-semibold">{{ seg.done ? '已调用' : '正在调用' }}: {{ seg.tool_name }}</span>
                      <span v-if="!seg.done" class="ml-auto flex gap-0.5">
                        <span class="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style="animation-delay:0ms"></span>
                        <span class="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style="animation-delay:150ms"></span>
                        <span class="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style="animation-delay:300ms"></span>
                      </span>
                    </div>
                    <!-- 入参 -->
                    <details v-if="seg.args" class="mt-1.5">
                      <summary class="text-slate-500 cursor-pointer select-none hover:text-slate-300 transition text-[11px]">查看入参</summary>
                      <pre class="mt-1 text-[11px] text-slate-400 bg-slate-950/50 p-2 rounded border border-slate-700/50 whitespace-pre-wrap break-all overflow-y-auto" style="max-height: 160px;">{{ seg.args }}</pre>
                    </details>
                    <!-- 出参 -->
                    <details v-if="seg.result" class="mt-1.5">
                      <summary class="cursor-pointer select-none hover:text-slate-300 transition text-[11px]" :class="seg.result.startsWith('Error') ? 'text-red-400' : 'text-emerald-500'">查看执行结果</summary>
                      <pre class="mt-1 text-[11px] text-slate-400 bg-slate-950/50 p-2 rounded border border-slate-700/50 whitespace-pre-wrap break-all overflow-y-auto" style="max-height: 160px;">{{ seg.result }}</pre>
                    </details>
                  </div>

                  <!-- File Artifact UI -->
                  <div v-else-if="seg.type === 'artifact'" class="bg-slate-900/80 border border-emerald-700/50 rounded-lg p-3 overflow-hidden">
                    <div class="flex items-center gap-3">
                      <div class="p-2 bg-emerald-900/50 rounded-lg text-emerald-400 shrink-0">
                        <FileText class="w-4 h-4" />
                      </div>
                      <div class="flex-1 min-w-0">
                        <div class="text-sm font-semibold text-emerald-300 truncate">📎 {{ seg.file_name }}</div>
                        <div class="text-xs text-slate-500 truncate mt-0.5">已生成产物文件</div>
                      </div>
                      <button @click="downloadFile(seg.file_url, seg.file_name)" class="shrink-0 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition shadow-sm flex items-center gap-1 cursor-pointer">
                        <Download class="w-3.5 h-3.5" />
                        下载
                      </button>
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </div>
          
          <div v-if="isChatting && chatMessages.length > 0 && getMessageContent(chatMessages[chatMessages.length - 1]) === ''" class="flex gap-4">
            <div class="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center shrink-0">
              <Bot class="w-5 h-5 text-white" />
            </div>
            <div class="px-4 py-3 rounded-2xl bg-slate-800 border border-slate-700 rounded-tl-sm flex items-center gap-2">
              <Loader2 class="w-4 h-4 animate-spin text-purple-400" />
              <span class="text-sm text-slate-400">正在思考与回应...</span>
            </div>
          </div>
        </div>

        <!-- Input Area -->
        <div class="p-4 bg-slate-800/80 backdrop-blur border-t border-slate-700">
          <div class="flex items-end gap-2 max-w-4xl mx-auto">
            <!-- Voice Input Button -->
            <button 
              v-if="agent.enable_voice !== 0"
              @mousedown="startListening" 
              @mouseup="stopListening"
              @mouseleave="stopListening"
              @touchstart.prevent="startListening"
              @touchend.prevent="stopListening"
              class="p-4 rounded-xl flex items-center justify-center transition-all duration-300 shadow-lg shrink-0"
              :class="isListening ? 'bg-rose-500 text-white animate-pulse shadow-rose-500/50 scale-105' : 'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white'"
              title="按住说话"
            >
              <Mic class="w-6 h-6" />
            </button>
            
            <div class="flex-1 relative group">
              <textarea 
                v-model="chatInput" 
                @keydown.enter.prevent="sendMessage"
                placeholder="在此输入文字，或长按左侧麦克风说话..." 
                class="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-200 resize-none overflow-hidden transition-all placeholder-slate-500 shadow-inner"
                rows="1"
                style="min-height: 52px; max-height: 150px"
              ></textarea>
              <div v-if="isListening" class="absolute inset-0 bg-slate-900/90 rounded-xl flex items-center px-4 border border-rose-500/50 pointer-events-none">
                <span class="flex items-center gap-2 text-rose-400 font-medium animate-pulse">
                  <div class="flex gap-1">
                    <span class="w-1 h-3 bg-rose-400 rounded-full animate-bounce"></span>
                    <span class="w-1 h-4 bg-rose-400 rounded-full animate-bounce" style="animation-delay: 0.1s"></span>
                    <span class="w-1 h-3 bg-rose-400 rounded-full animate-bounce" style="animation-delay: 0.2s"></span>
                  </div>
                  聆听中: {{ transcript }}
                </span>
              </div>
            </div>

            <button 
              @click="sendMessage" 
              :disabled="(!chatInput.trim() && !isListening) || isChatting"
              class="p-3 bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl transition-colors shadow-lg shadow-indigo-500/20 flex items-center justify-center h-[52px] w-[52px] shrink-0"
            >
              <Send class="w-5 h-5" />
            </button>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Bot, LogOut, Camera, Video, VideoOff, Mic, Send, User, Loader2, Wrench, Download, FileText } from 'lucide-vue-next'
import request from '../utils/request'
import { Message } from '../utils/message'
import { marked } from 'marked'

const route = useRoute()
const router = useRouter()
const agentId = route.params.id

// 为每次运行生成一个独立的会话 ID
const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

const agent = ref<any>({})
const chatMessages = ref<any[]>([])
const chatInput = ref('')
const isChatting = ref(false)
const chatContainerRef = ref<HTMLElement | null>(null)
const isExiting = ref(false)

// Camera State
const videoRef = ref<HTMLVideoElement | null>(null)
const isCameraOn = ref(false)
let mediaStream: MediaStream | null = null
let mediaRecorder: MediaRecorder | null = null
let recordedChunks: Blob[] = []

// Speech State
const isListening = ref(false)
const transcript = ref('')
let recognition: any = null
const synth = window.speechSynthesis

const fetchAgent = async () => {
  try {
    const res = await request.get(`/api/agents/${agentId}`)
    agent.value = res.data
    chatMessages.value = [{ role: 'assistant', segments: [{ type: 'text', content: `你好！我是 ${agent.value.name || 'AI'}。我们可以开始语音或者文字交流了。如果你开启了摄像头，我也能“看到”你！` }] }]
    speakText(chatMessages.value[0].segments[0].content)
  } catch (err) {
    Message.error('无法加载智能体')
  }
}

const renderMarkdown = (text: string) => {
  return marked(text || '')
}

const downloadFile = async (url: string, fileName: string) => {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(blobUrl)
  } catch (e) {
    Message.error('下载失败')
  }
}

const getMessageContent = (msg: any): string => {
  if (msg.segments) {
    return msg.segments.filter((s: any) => s.type === 'text').map((s: any) => s.content).join('')
  }
  return msg.content || ''
}

const scrollToBottom = () => {
  nextTick(() => {
    if (chatContainerRef.value) {
      chatContainerRef.value.scrollTop = chatContainerRef.value.scrollHeight
    }
  })
}

const uploadRecording = async (blob: Blob) => {
  const formData = new FormData()
  formData.append('video', blob, 'recording.webm')
  try {
    Message.info('正在保存视频记录...')
    await request.post(`/api/agents/${agentId}/recordings?sessionId=${sessionId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    Message.success('视频记录已保存至后台')
  } catch (err) {
    Message.error('视频记录保存失败')
  }
}

const startRecording = () => {
  if (!mediaStream) return
  recordedChunks = []
  try {
    mediaRecorder = new MediaRecorder(mediaStream, { mimeType: 'video/webm' })
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data)
    }
    mediaRecorder.onstop = async () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' })
      recordedChunks = []
      await uploadRecording(blob)
    }
    mediaRecorder.start()
  } catch (err) {
    console.error('Failed to start recording:', err)
  }
}

const stopRecording = () => {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
  }
}

// Camera Logic
const toggleCamera = async () => {
  if (isCameraOn.value) {
    stopRecording()
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop())
    }
    if (videoRef.value) videoRef.value.srcObject = null
    isCameraOn.value = false
  } else {
    try {
      // 请求视频和音频（如果需要录下用户声音）
      mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      if (videoRef.value) {
        videoRef.value.srcObject = mediaStream
      }
      isCameraOn.value = true
      startRecording()
    } catch (err) {
      Message.error('无法访问摄像头或麦克风，请检查权限')
    }
  }
}

const handleExit = async () => {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    isExiting.value = true
    await new Promise(resolve => {
      const originalOnStop = mediaRecorder!.onstop as any
      mediaRecorder!.onstop = async (e) => {
        if (originalOnStop) await originalOnStop(e)
        resolve(true)
      }
      mediaRecorder!.stop()
    })
  }
  router.back()
}

// Speech to Text (STT) Logic
const initSpeechRecognition = () => {
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  if (SpeechRecognition) {
    recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'zh-CN'
    
    recognition.onresult = (event: any) => {
      let finalTranscript = ''
      let interimTranscript = ''
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript
        } else {
          interimTranscript += event.results[i][0].transcript
        }
      }
      transcript.value = interimTranscript
      if (finalTranscript) {
        chatInput.value += (chatInput.value ? ' ' : '') + finalTranscript
      }
    }
    
    recognition.onerror = (event: any) => {
      console.error('Speech recognition error', event.error)
      isListening.value = false
    }
    
    recognition.onend = () => {
      isListening.value = false
      if (transcript.value) {
        chatInput.value += (chatInput.value ? ' ' : '') + transcript.value
        transcript.value = ''
      }
    }
  } else {
    console.warn('Speech Recognition API not supported in this browser.')
  }
}

const startListening = () => {
  if (!recognition) {
    Message.warning('您的浏览器暂不支持语音识别，请使用最新版 Chrome。')
    return
  }
  if (synth) synth.cancel() // 说话前停止当前正在播放的声音
  transcript.value = ''
  isListening.value = true
  recognition.start()
}

const stopListening = () => {
  if (isListening.value && recognition) {
    recognition.stop()
    isListening.value = false
  }
}

// Text to Speech (TTS) Logic
const speakText = (text: string) => {
  if (!synth) return
  synth.cancel()
  
  // 去除 markdown 标记和特殊符号，只读纯文本
  const plainText = text.replace(/[#*`_\[\]()]/g, '').trim()
  if (!plainText) return
  
  const utterance = new SpeechSynthesisUtterance(plainText)
  utterance.lang = 'zh-CN'
  utterance.rate = 1.0
  utterance.pitch = 1.0
  
  // 可以在这里寻找最像真人的内置声音
  const voices = synth.getVoices()
  const zhVoice = voices.find(v => v.lang.includes('zh') && (v.name.includes('Xiaoxiao') || v.name.includes('Ting-Ting')))
  if (zhVoice) {
    utterance.voice = zhVoice
  }
  
  synth.speak(utterance)
}

// 为了确保能拿到声音列表，加载时触发一次
if (synth && synth.onvoiceschanged !== undefined) {
  synth.onvoiceschanged = () => {}
}

// Chat Logic
const sendMessage = async () => {
  // 如果还在识别阶段，按发送也顺便停止
  stopListening()
  
  if (!chatInput.value.trim() || isChatting.value) return
  
  const userText = chatInput.value
  chatInput.value = ''
  
  const segments: any[] = [{ type: 'text', content: userText }]
  
  const userMsg = { role: 'user', segments }
  chatMessages.value.push(userMsg)
  scrollToBottom()
  
  isChatting.value = true
  
  // Create a placeholder for assistant's response
  chatMessages.value.push({ role: 'assistant', segments: [] })
  const assistantMessageIndex = chatMessages.value.length - 1
  
  const getOrCreateTextSegment = () => {
    const currentMsg = chatMessages.value[assistantMessageIndex]
    let lastSeg = currentMsg.segments[currentMsg.segments.length - 1]
    if (!lastSeg || lastSeg.type !== 'text') {
      lastSeg = { type: 'text', content: '' }
      currentMsg.segments.push(lastSeg)
    }
    return lastSeg
  }
  
  // Stop current speech
  if (synth) synth.cancel()
  
  try {
    const payload = {
      sessionId,
      // 传递最近的上下文
      messages: chatMessages.value.slice(0, -1).map(m => {
        if (!m.segments) return { role: m.role, content: m.content || '' }
        const texts = m.segments.filter((s: any) => s.type === 'text').map((s: any) => s.content).join('')
        const images = m.segments.filter((s: any) => s.type === 'image').map((s: any) => ({
          type: 'image_url',
          image_url: { url: s.base64 }
        }))
        if (images.length === 0) return { role: m.role, content: texts }
        return { role: m.role, content: [{ type: 'text', text: texts }, ...images] }
      })
    }
    
    const response = await fetch(`/api/agents/${agentId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    
    if (!response.body) throw new Error('No body')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    
    let currentText = ''
    let buffer = ''
    
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n\n')
      buffer = lines.pop() || ''
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6)
          if (dataStr === '[DONE]') continue
          
          try {
            const data = JSON.parse(dataStr)
            const currentMsg = chatMessages.value[assistantMessageIndex]
            
            if (data.type === 'TEXT_MESSAGE_CONTENT') {
              currentText += data.delta || ''
              getOrCreateTextSegment().content += data.delta || ''
              scrollToBottom()
            } else if (data.type === 'TOOL_CALL_START') {
              currentMsg.segments.push({ type: 'tool', tool_name: data.tool_name, args: '', done: false })
              scrollToBottom()
            } else if (data.type === 'TOOL_CALL_CHUNK') {
              const toolSeg = [...currentMsg.segments].reverse().find((s: any) => s.type === 'tool')
              if (toolSeg) toolSeg.args += data.delta
            } else if (data.type === 'TOOL_CALL_END') {
              const toolSeg = [...currentMsg.segments].reverse().find((s: any) => s.type === 'tool')
              if (toolSeg) {
                toolSeg.done = true
                scrollToBottom()
              }
            } else if (data.type === 'TOOL_CALL_RESULT') {
              const toolSeg = [...currentMsg.segments].reverse().find((s: any) => s.type === 'tool' && s.tool_name === data.tool_name)
              if (toolSeg) toolSeg.result = data.result
            } else if (data.type === 'FILE_ARTIFACT') {
              const encodedPath = data.file_path.split('/').map((seg: string) => encodeURIComponent(seg)).join('/');
              currentMsg.segments.push({
                type: 'artifact',
                file_name: data.file_name,
                file_path: data.file_path,
                file_url: `http://localhost:8001${encodedPath}`
              })
              scrollToBottom()
            }
          } catch(e) {}
        }
      }
    }
    
    // Auto speak the response
    if (currentText) {
      speakText(currentText)
    }
    
  } catch (err) {
    console.error(err)
    Message.error('对话请求失败')
    chatMessages.value.pop() // Remove the empty assistant message
  } finally {
    isChatting.value = false
  }
}

onMounted(() => {
  fetchAgent()
  initSpeechRecognition()
})

onUnmounted(() => {
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop())
  }
  if (synth) synth.cancel()
})
</script>
