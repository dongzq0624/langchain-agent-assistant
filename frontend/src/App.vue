<script setup lang="ts">
import { computed, ref, nextTick, watch, onMounted } from 'vue'

// 后端 API 地址（生产环境从环境变量读取，开发环境走 vite proxy）
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

type Role = 'user' | 'assistant'

interface SourceItem {
  source: string
  page?: number
  preview: string
}

interface ChatMessage {
  role: Role
  content: string
  sources?: SourceItem[]
  timestamp?: number
}

interface ModelConfig {
  provider: 'deepseek' | 'openai' | 'zhipu' | 'siliconflow'
  apiKey: string
  baseUrl: string
  model: string
  temperature: number
  maxTokens: number
}

interface AppSettings {
  model: ModelConfig
  retrievalMode: 'embedding' | 'keyword'
  topK: number
}

const providerModels: Record<string, { model: string; baseUrl: string }> = {
  deepseek: {
    model: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com',
  },
  openai: {
    model: 'gpt-4o-mini',
    baseUrl: 'https://api.openai.com/v1',
  },
  zhipu: {
    model: 'glm-4-flash',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  },
  siliconflow: {
    model: 'Qwen/Qwen2.5-7B-Instruct',
    baseUrl: 'https://api.siliconflow.cn/v1',
  },
}

// Theme system
const theme = ref<'light' | 'dark'>('light')

function initTheme() {
  const stored = localStorage.getItem('theme') as 'light' | 'dark' | null
  if (stored) {
    theme.value = stored
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    theme.value = 'dark'
  }
  applyTheme()
}

function applyTheme() {
  const html = document.documentElement
  if (theme.value === 'dark') {
    html.setAttribute('data-theme', 'dark')
  } else {
    html.removeAttribute('data-theme')
  }
  localStorage.setItem('theme', theme.value)
  const metaTheme = document.querySelector('meta[name="theme-color"]')
  if (metaTheme) {
    metaTheme.setAttribute('content', theme.value === 'dark' ? '#0f0f23' : '#4f46e5')
  }
}

function toggleTheme() {
  theme.value = theme.value === 'light' ? 'dark' : 'light'
  applyTheme()
}

const examples = [
  { text: '上班时间是什么？', icon: '🕐' },
  { text: '试用期多久？', icon: '📋' },
  { text: '公司有哪些福利？', icon: '🎁' },
   { text: '如何申请加班？', icon: '🕓' },

]
const messages = ref<ChatMessage[]>([
  {
    role: 'assistant',
    content: '你好，我是入职助手。你可以询问入职流程、作息时间、交通路线、福利制度等问题。',
    timestamp: Date.now(),
  },
])
const question = ref('')
const loading = ref(false)
const errorMessage = ref('')
const messageListRef = ref<HTMLElement | null>(null)
const contentKey = ref(0)
const showSettings = ref(false)
const settings = ref<AppSettings>({
  model: {
    provider: 'deepseek',
    apiKey: '',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    temperature: 0.7,
    maxTokens: 1000,
  },
  retrievalMode: 'keyword',
  topK: 3,
})
const settingsLoading = ref(false)

onMounted(() => {
  initTheme()
})

async function loadSettings() {
  try {
    const res = await fetch(`${API_BASE}/api/settings`)
    if (res.ok) {
      const data = await res.json()
      settings.value = data
    }
  } catch {
    // ignore
  }
}

async function saveSettings() {
  settingsLoading.value = true
  try {
    const res = await fetch(`${API_BASE}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings.value),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.message || '保存失败')
    }
    showSettings.value = false
  } catch (err) {
    const msg = err instanceof Error ? err.message : '保存失败'
    errorMessage.value = msg
  } finally {
    settingsLoading.value = false
  }
}

function onProviderChange() {
  const config = providerModels[settings.value.model.provider]
  if (config) {
    settings.value.model.baseUrl = config.baseUrl
    settings.value.model.model = config.model
  }
}

const conversationHistory = computed(() =>
  messages.value
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map(({ role, content }) => ({ role, content })),
)

function scrollToBottom() {
  nextTick(() => {
    const el = messageListRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

watch(messages, scrollToBottom, { deep: true })

function parseMarkdown(text: string): string {
  let html = text
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="code-block"><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="numbered">$2</li>')
    .replace(/\n\n/g, '</p><p class="paragraph">')
    .replace(/\n/g, '<br />')

  html = '<p class="paragraph">' + html + '</p>'

  html = html.replace(/<p class="paragraph"><li/g, '<ul><li')
  html = html.replace(/<\/li>(?!\s*<li)/g, '</li></ul>')
  html = html.replace(/<\/ul><p class="paragraph">/g, '</ul>')

  return html
}

function getStreamingContent(msg: { role: Role; content: string; sources?: SourceItem[]; timestamp?: number }): string {
  const showCursor = loading.value && msg.role === 'assistant' && msg === messages.value[messages.value.length - 1]
  const cursor = showCursor ? '<span class="typing-cursor">▍</span>' : ''
  return parseMarkdown(msg.content) + cursor
}

async function sendQuestion(customQuestion?: string) {
  const text = (customQuestion ?? question.value).trim()
  if (!text || loading.value) return

  errorMessage.value = ''
  messages.value.push({ role: 'user', content: text, timestamp: Date.now() })
  question.value = ''
  loading.value = true

  const assistantMessage = ref<ChatMessage>({
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
  })
  messages.value.push(assistantMessage.value)

  try {
    const response = await fetch(`${API_BASE}/api/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: text, history: conversationHistory.value }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message ?? '请求失败')
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('无法读取响应流')

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''

      for (const part of parts) {
        const lines = part.split('\n')
        let eventType = ''
        let data = ''

        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventType = line.substring(6).trim()
          } else if (line.startsWith('data:')) {
            data = line.substring(5).trim()
          }
        }

        if (eventType === 'chunk' && data) {
          try {
            const parsed = JSON.parse(data)
            if (parsed.content !== undefined) {
              assistantMessage.value.content += parsed.content
              await nextTick()
              scrollToBottom()
            }
          } catch {
            // ignore
          }
        } else if (eventType === 'sources' && data) {
          try {
            const parsed = JSON.parse(data)
            if (parsed.sources) {
              assistantMessage.value.sources = parsed.sources
            }
          } catch {
            // ignore
          }
        } else if (eventType === 'error') {
          let errMsg = '服务异常'
          if (data) {
            try {
              const parsed = JSON.parse(data) as { message?: string }
              if (typeof parsed.message === 'string' && parsed.message.length > 0) {
                errMsg = parsed.message
              }
            } catch {
              /* 使用默认文案 */
            }
          }
          throw new Error(errMsg)
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : '请求失败'
    errorMessage.value = msg
    assistantMessage.value.content = '抱歉，我暂时无法回答这个问题，请稍后重试。'
  } finally {
    loading.value = false
    assistantMessage.value.timestamp = Date.now()
    contentKey.value++
  }
}

function formatTime(timestamp?: number) {
  if (!timestamp) return ''
  const d = new Date(timestamp)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}
</script>

<template>
  <div class="page-shell">
    <aside class="hero-panel">
      <div class="brand">
        <div class="brand-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
        <span class="brand-name">入职助手</span>
      </div>

      <p class="hero-subtitle">Enterprise Onboarding Assistant</p>

      <div class="status-card">
        <span class="status-dot" />
        <span>系统就绪</span>
      </div>

      <div class="features">
        <div class="feature-item">
          <span class="feature-icon">📚</span>
          <span>知识库检索</span>
        </div>
        <div class="feature-item">
          <span class="feature-icon">🤖</span>
          <span>AI 智能回答</span>
        </div>
        <div class="feature-item">
          <span class="feature-icon">📎</span>
          <span>来源可查</span>
        </div>
      </div>

      <button class="settings-button" @click="showSettings = true; loadSettings()">
        <span class="settings-icon">⚙️</span>
        <span>模型设置</span>
      </button>

      <button class="theme-toggle" @click="toggleTheme" :title="theme === 'light' ? '切换到暗夜模式' : '切换到浅色模式'">
        <span class="theme-toggle-icon">
          <svg class="sun-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="5"/>
            <line x1="12" y1="1" x2="12" y2="3"/>
            <line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/>
            <line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
          <svg class="moon-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        </span>
        <span class="theme-toggle-label">{{ theme === 'light' ? '暗夜模式' : '浅色模式' }}</span>
      </button>

      <div class="divider" />

      <h3 class="example-title">快捷问题</h3>
      <div class="example-list">
        <button
          v-for="item in examples"
          :key="item.text"
          class="example-button"
          type="button"
          @click="sendQuestion(item.text)"
        >
          <span class="example-icon">{{ item.icon }}</span>
          <span class="example-text">{{ item.text }}</span>
        </button>
      </div>
    </aside>

    <main class="chat-panel">
      <header class="chat-header">
        <div class="header-info">
          <h2>智能问答</h2>
          <p>基于企业知识库的 AI 入职助手</p>
        </div>
        <div class="header-badge">RAG + LLM</div>
      </header>

      <section ref="messageListRef" class="message-list">
        <TransitionGroup name="message">
          <article
            v-for="(msg, idx) in messages"
            :key="idx"
            class="message-card"
            :class="[msg.role, { pending: msg.role === 'assistant' && idx === messages.length - 1 && loading }]"
          >
            <div class="message-header">
              <span class="message-avatar">
                {{ msg.role === 'user' ? '👤' : '🤖' }}
              </span>
              <span class="message-role">{{ msg.role === 'user' ? '你' : '入职助手' }}</span>
              <span class="message-time">{{ formatTime(msg.timestamp) }}</span>
            </div>
            <div class="message-body">
              <div v-if="msg.role === 'assistant'" class="assistant-content" :key="contentKey" v-html="getStreamingContent(msg)" />
              <div v-else class="message-content">{{ msg.content }}</div>

              <div v-if="msg.sources?.length && !(loading && idx === messages.length - 1)" class="source-section">
                <div class="source-header">
                  <span class="source-icon">📎</span>
                  <span>参考资料</span>
                </div>
                <div v-for="src in msg.sources" :key="`${src.source}-${src.page}`" class="source-item">
                  <div class="source-title">
                    {{ src.source }}
                    <span v-if="src.page" class="source-page">第 {{ src.page }} 页</span>
                  </div>
                  <div class="source-preview">{{ src.preview }}</div>
                </div>
              </div>
            </div>
          </article>
        </TransitionGroup>

      </section>

      <Transition name="fade">
        <div v-if="errorMessage" class="error-toast">
          <span class="error-icon">⚠️</span>
          {{ errorMessage }}
        </div>
      </Transition>

      <form class="composer" @submit.prevent="sendQuestion()">
        <textarea
          v-model="question"
          class="composer-input"
          rows="2"
          placeholder="输入您的问题..."
          @keydown.enter.exact.prevent="sendQuestion()"
        />
        <button class="composer-button" type="submit" :disabled="loading || !question.trim()">
          <span v-if="!loading" class="btn-icon">➤</span>
          <span v-else class="btn-spinner" />
        </button>
      </form>

      <Transition name="modal">
        <div v-if="showSettings" class="modal-overlay" @click.self="showSettings = false">
          <div class="modal-panel">
            <div class="modal-header">
              <h2>模型设置</h2>
              <button class="modal-close" @click="showSettings = false">✕</button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label>AI 提供商</label>
                <select v-model="settings.model.provider" @change="onProviderChange">
                  <option value="deepseek">DeepSeek</option>
                  <option value="openai">OpenAI</option>
                  <option value="zhipu">智谱 GLM</option>
                  <option value="siliconflow">SiliconFlow</option>
                </select>
              </div>

              <div class="form-group">
                <label>API Key</label>
                <input
                  v-model="settings.model.apiKey"
                  type="password"
                  placeholder="输入 API Key"
                />
              </div>

              <div class="form-group">
                <label>模型名称</label>
                <input
                  v-model="settings.model.model"
                  type="text"
                  placeholder="如: deepseek-chat"
                />
              </div>

              <div class="form-group">
                <label>API 地址</label>
                <input
                  v-model="settings.model.baseUrl"
                  type="text"
                  placeholder="https://api.deepseek.com"
                />
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label>温度 (Temperature)</label>
                  <div class="slider-row">
                    <input
                      v-model.number="settings.model.temperature"
                      type="range"
                      min="0"
                      max="2"
                      step="0.1"
                    />
                    <span class="slider-value">{{ settings.model.temperature.toFixed(1) }}</span>
                  </div>
                  <p class="form-hint">控制随机性，较低值更确定，较高值更有创意</p>
                </div>

                <div class="form-group">
                  <label>最大回复长度</label>
                  <div class="slider-row">
                    <input
                      v-model.number="settings.model.maxTokens"
                      type="range"
                      min="100"
                      max="4000"
                      step="100"
                    />
                    <span class="slider-value">{{ settings.model.maxTokens }}</span>
                  </div>
                  <p class="form-hint">限制回复的最大 token 数量</p>
                </div>
              </div>

              <div class="form-group">
                <label>检索模式</label>
                <div class="radio-group">
                  <label class="radio-item">
                    <input v-model="settings.retrievalMode" type="radio" value="keyword" />
                    <span>关键词检索</span>
                  </label>
                  <label class="radio-item">
                    <input v-model="settings.retrievalMode" type="radio" value="embedding" />
                    <span>向量检索 (需要 OpenAI API Key)</span>
                  </label>
                </div>
              </div>

              <div class="form-group">
                <label>检索数量 (Top K)</label>
                <div class="slider-row">
                  <input
                    v-model.number="settings.topK"
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                  />
                  <span class="slider-value">{{ settings.topK }}</span>
                </div>
                <p class="form-hint">从知识库中检索的相关文档数量</p>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn-cancel" @click="showSettings = false">取消</button>
              <button class="btn-save" :disabled="settingsLoading" @click="saveSettings">
                {{ settingsLoading ? '保存中...' : '保存设置' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </main>
  </div>
</template>
