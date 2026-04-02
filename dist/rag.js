import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PDF_DIR = path.resolve(__dirname, '../pdfs');
const TOP_K = 3;
const MAX_HISTORY = 8;
const llm = new ChatOpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    model: process.env.DEEPSEEK_MODEL,
    temperature: 0.01,
    maxTokens: 1000,
    configuration: { baseURL: process.env.DEEPSEEK_BASE_URL },
});
let knowledgeBase = [];
let embeddingsModel = null;
let retrievalMode = 'keyword';
let initializationPromise = null;
function tokenize(text) {
    const normalized = text.toLowerCase();
    const englishTokens = normalized.match(/[a-z0-9]+/g) ?? [];
    const chineseChars = Array.from(normalized.match(/[\u4e00-\u9fa5]/g) ?? []);
    const chineseTokens = chineseChars.flatMap((char, index) => {
        const nextChar = chineseChars[index + 1];
        return nextChar ? [char, `${char}${nextChar}`] : [char];
    });
    return new Set([...englishTokens, ...chineseTokens]);
}
function cosineSimilarity(left, right) {
    if (left.length !== right.length || left.length === 0) {
        return 0;
    }
    let dotProduct = 0;
    let leftNorm = 0;
    let rightNorm = 0;
    for (let index = 0; index < left.length; index += 1) {
        dotProduct += left[index] * right[index];
        leftNorm += left[index] * left[index];
        rightNorm += right[index] * right[index];
    }
    if (leftNorm === 0 || rightNorm === 0) {
        return 0;
    }
    return dotProduct / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}
function keywordSimilarity(questionTokens, chunkTokens) {
    if (!questionTokens.size || !chunkTokens.size) {
        return 0;
    }
    let overlap = 0;
    for (const token of questionTokens) {
        if (chunkTokens.has(token)) {
            overlap += 1;
        }
    }
    return overlap / Math.sqrt(questionTokens.size * chunkTokens.size);
}
function formatHistory(history) {
    if (!history.length) {
        return '无';
    }
    return history
        .map(message => `${message.role === 'user' ? '用户' : '助手'}：${message.content}`)
        .join('\n');
}
function formatSource(chunk) {
    return chunk.page ? `${chunk.source} 第 ${chunk.page} 页` : chunk.source;
}
function normalizeHistory(history) {
    return history
        .filter(message => message.role === 'user' || message.role === 'assistant')
        .slice(-MAX_HISTORY);
}
async function buildEmbeddingIndex() {
    const embeddingApiKey = process.env.OPENAI_API_KEY;
    const embeddingBaseURL = process.env.OPENAI_EMBEDDING_BASE_URL || process.env.OPENAI_BASE_URL;
    const embeddingModelName = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
    if (!embeddingApiKey) {
        retrievalMode = 'keyword';
        console.log('⚠️ 未检测到 OPENAI_API_KEY，当前使用关键词检索模式');
        return;
    }
    embeddingsModel = new OpenAIEmbeddings({
        apiKey: embeddingApiKey,
        model: embeddingModelName,
        configuration: embeddingBaseURL ? { baseURL: embeddingBaseURL } : undefined,
    });
    const vectors = await embeddingsModel.embedDocuments(knowledgeBase.map(chunk => chunk.content));
    knowledgeBase = knowledgeBase.map((chunk, index) => ({
        ...chunk,
        embedding: vectors[index],
    }));
    retrievalMode = 'embedding';
    console.log('✅ 知识库构建完成，已启用向量检索');
}
async function loadDocuments() {
    console.log('🔍 解析PDF并构建知识库...');
    const files = fs.readdirSync(PDF_DIR).filter(file => file.endsWith('.pdf'));
    if (!files.length) {
        throw new Error('请放入PDF到pdfs文件夹');
    }
    const docs = [];
    for (const file of files) {
        const loader = new PDFLoader(path.join(PDF_DIR, file), { splitPages: false });
        docs.push(...(await loader.load()));
        console.log('✅ 已加载：', file);
    }
    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 100,
    });
    const splitDocs = await splitter.splitDocuments(docs);
    knowledgeBase = splitDocs
        .map(doc => ({
        content: doc.pageContent.trim(),
        source: path.basename(String(doc.metadata.source ?? '未知来源')),
        page: typeof doc.metadata.loc?.pageNumber === 'number' ? doc.metadata.loc.pageNumber : undefined,
        tokens: tokenize(doc.pageContent),
    }))
        .filter(chunk => chunk.content.length > 0);
    try {
        await buildEmbeddingIndex();
    }
    catch (error) {
        retrievalMode = 'keyword';
        embeddingsModel = null;
        const message = error instanceof Error ? error.message : String(error);
        console.log(`⚠️ 向量检索初始化失败，已回退为关键词检索：${message}`);
    }
    if (retrievalMode === 'keyword') {
        console.log('✅ 知识库构建完成，已启用关键词 RAG 检索');
    }
}
async function retrieveRelevantChunks(question) {
    if (!knowledgeBase.length) {
        return [];
    }
    if (retrievalMode === 'embedding' && embeddingsModel) {
        const queryVector = await embeddingsModel.embedQuery(question);
        return [...knowledgeBase]
            .map(chunk => ({
            chunk,
            score: chunk.embedding ? cosineSimilarity(queryVector, chunk.embedding) : 0,
        }))
            .sort((left, right) => right.score - left.score)
            .slice(0, TOP_K)
            .filter(item => item.score > 0)
            .map(item => item.chunk);
    }
    const questionTokens = tokenize(question);
    return [...knowledgeBase]
        .map(chunk => ({
        chunk,
        score: keywordSimilarity(questionTokens, chunk.tokens),
    }))
        .sort((left, right) => right.score - left.score)
        .slice(0, TOP_K)
        .filter(item => item.score > 0)
        .map(item => item.chunk);
}
export async function initializeKnowledgeBase() {
    if (!initializationPromise) {
        initializationPromise = loadDocuments();
    }
    await initializationPromise;
}
export async function askAssistant(question, history = []) {
    await initializeKnowledgeBase();
    const relevantChunks = await retrieveRelevantChunks(question);
    const context = relevantChunks.length
        ? relevantChunks
            .map((chunk, index) => `资料 ${index + 1}（${formatSource(chunk)}）\n${chunk.content}`)
            .join('\n\n')
        : '未检索到相关资料。';
    const prompt = ChatPromptTemplate.fromMessages([
        [
            'system',
            '你是专业的企业入职助手。请优先依据检索结果回答问题，不要编造制度、流程或福利信息。如果检索结果不足以回答，请明确说明未在知识库中找到相关内容。回答保持简洁准确。',
        ],
        [
            'human',
            '历史对话：\n{history}\n\n检索结果：\n{context}\n\n当前问题：\n{question}',
        ],
    ]);
    const formattedPrompt = await prompt.invoke({
        history: formatHistory(normalizeHistory(history)),
        context,
        question,
    });
    const response = await llm.invoke(formattedPrompt);
    const answer = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    return {
        answer,
        retrievalMode,
        sources: relevantChunks.map(chunk => ({
            source: chunk.source,
            page: chunk.page,
            preview: chunk.content.slice(0, 180),
        })),
    };
}
