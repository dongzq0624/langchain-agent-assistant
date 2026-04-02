export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}
export interface ChatSource {
    source: string;
    page?: number;
    preview: string;
}
export interface ChatResult {
    answer: string;
    sources: ChatSource[];
    retrievalMode: 'embedding' | 'keyword';
}
export declare function initializeKnowledgeBase(): Promise<void>;
export declare function askAssistant(question: string, history?: ChatMessage[]): Promise<ChatResult>;
