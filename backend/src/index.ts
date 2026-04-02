import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import { askAssistant, askAssistantStream, initializeKnowledgeBase, getSettings, updateSettings, type ChatMessage } from './rag.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDist = path.resolve(__dirname, '../frontend/dist');
const frontendIndex = path.join(frontendDist, 'index.html');
const port = Number(process.env.PORT || 3000);

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.get('/api/settings', (_request, response) => {
  response.json(getSettings());
});

app.put('/api/settings', (request, response) => {
  try {
    const newSettings = request.body;
    const updated = updateSettings(newSettings);
    response.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : '设置更新失败';
    response.status(400).json({ message });
  }
});

app.post('/api/chat', async (request, response) => {
  const question = typeof request.body?.question === 'string' ? request.body.question.trim() : '';
  const history = Array.isArray(request.body?.history) ? (request.body.history as ChatMessage[]) : [];

  if (!question) {
    response.status(400).json({ message: 'question 不能为空' });
    return;
  }

  try {
    const result = await askAssistant(question, history);
    response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : '服务内部异常';
    response.status(500).json({ message });
  }
});

app.post('/api/chat/stream', async (request, response) => {
  const question = typeof request.body?.question === 'string' ? request.body.question.trim() : '';
  const history = Array.isArray(request.body?.history) ? (request.body.history as ChatMessage[]) : [];

  if (!question) {
    response.status(400).json({ message: 'question 不能为空' });
    return;
  }

  response.setHeader('Content-Type', 'text/event-stream');
  response.setHeader('Cache-Control', 'no-cache');
  response.setHeader('Connection', 'keep-alive');
  response.setHeader('X-Accel-Buffering', 'no');

  const sendEvent = (event: string, data: unknown) => {
    response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    await askAssistantStream(question, history, (chunk) => {
      sendEvent('chunk', { content: chunk });
    }, (sources) => {
      sendEvent('sources', { sources });
    });
    response.write('event: done\ndata: {}\n\n');
    response.end();
  } catch (error) {
    const message = error instanceof Error ? error.message : '服务内部异常';
    response.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
    response.end();
  }
});

if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));

  app.get('/', (_request, response) => {
    response.sendFile(frontendIndex);
  });
}

async function startServer() {
  await initializeKnowledgeBase();
  app.listen(port, () => {
    console.log(`🚀 API 服务已启动：http://localhost:${port}`);
    if (fs.existsSync(frontendIndex)) {
      console.log(`🌐 页面地址：http://localhost:${port}`);
    }
  });
}

startServer().catch(error => {
  console.error('❌ 服务启动失败：', error);
  process.exit(1);
});
