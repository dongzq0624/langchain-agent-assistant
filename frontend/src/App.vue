<script setup lang="ts">
import { computed, ref } from 'vue'

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
}

const examples = ['上班时间是什么？', '试用期多久？', '地铁怎么做？']
const messages = ref<ChatMessage[]>([
  {
    role: 'assistant',
    content: '你好，我是入职助手。你可以询问入职流程、作息时间、交通路线、福利制度等问题。',
  },
])
const question = ref('')
const loading = ref(false)
const errorMessage = ref('')

const conversationHistory = computed(() =>
  messages.value
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .map(({ role, content }) => ({ role, content })),
)

async function sendQuestion(customQuestion?: string) {
  const text = (customQuestion ?? question.value).trim()
  if (!text || loading.value) {
    return
  }

  errorMessage.value = ''
  messages.value.push({ role: 'user', content: text })
  question.value = ''
  loading.value = true

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: text,
        history: conversationHistory.value,
      }),
    })

    const payload = await response.json()

    if (!response.ok) {
      throw new Error(payload.message ?? '请求失败')
    }

    messages.value.push({
      role: 'assistant',
      content: payload.answer,
      sources: payload.sources ?? [],
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '请求失败'
    errorMessage.value = message
    messages.value.push({
      role: 'assistant',
      content: '抱歉，我暂时无法回答这个问题，请稍后重试。',
    })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="page-shell">
    <aside class="hero-panel">
      <p class="eyebrow">Node.js + Express + Vue3 + TypeScript</p>
      <h1>AI 入职助手</h1>
      <p class="hero-text">
        基于企业 PDF 知识库进行 RAG 检索，再结合大模型生成回答，适合展示入职流程、制度问答与办公指引场景。
      </p>
      <div class="status-card">
        <span class="status-dot" />
        <span>后端接口：/api/chat</span>
      </div>
      <div class="example-list">
        <button
          v-for="item in examples"
          :key="item"
          class="example-button"
          type="button"
          @click="sendQuestion(item)"
        >
          {{ item }}
        </button>
      </div>
    </aside>

    <main class="chat-panel">
      <header class="chat-header">
        <div>
          <h2>对话演示</h2>
          <p>输入问题后，页面会调用后端 RAG 接口获取答案与资料来源。</p>
        </div>
      </header>

      <section class="message-list">
        <article
          v-for="(message, index) in messages"
          :key="`${message.role}-${index}`"
          class="message-card"
          :class="message.role"
        >
          <div class="message-role">{{ message.role === 'user' ? '你' : '入职助手' }}</div>
          <div class="message-content">{{ message.content }}</div>
          <div v-if="message.sources?.length" class="source-list">
            <div v-for="source in message.sources" :key="`${source.source}-${source.page}`" class="source-item">
              <strong>{{ source.source }}<span v-if="source.page"> 第 {{ source.page }} 页</span></strong>
              <span>{{ source.preview }}</span>
            </div>
          </div>
        </article>

        <article v-if="loading" class="message-card assistant pending">
          <div class="message-role">入职助手</div>
          <div class="message-content">正在检索知识库并生成回答...</div>
        </article>
      </section>

      <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>

      <form class="composer" @submit.prevent="sendQuestion()">
        <textarea
          v-model="question"
          class="composer-input"
          rows="3"
          placeholder="例如：入职第一天需要准备什么材料？"
        />
        <button class="composer-button" type="submit" :disabled="loading">
          {{ loading ? '处理中...' : '发送' }}
        </button>
      </form>
    </main>
  </div>
</template>
