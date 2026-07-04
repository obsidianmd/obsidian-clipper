import { ModelConfig } from '../../types/types';
import { chatComplete, ChatMessage } from './chat-llm';
import { debugLog } from '../../utils/debug';

export type ChatStatus = 'idle' | 'sending' | 'error' | 'done';

export interface ChatTurn {
	role: 'user' | 'assistant';
	content: string;
}

export interface ChatState {
	turns: ChatTurn[];
	status: ChatStatus;
	error?: string;
}

type Listener = (state: ChatState) => void;

const DEFAULT_SYSTEM_PROMPT =
	'You are an AI assistant built into Obsidian Web Clipper.\n' +
	'The user is browsing a web page and will ask questions about its content.\n' +
	'\n' +
	'Guidelines:\n' +
	'- Be concise and accurate\n' +
	'- Respond in Markdown format\n' +
	'- Base your answers only on the provided context\n' +
	'- If the information is not in the context, say so clearly\n' +
	'- Respond in the same language as the user\'s question';

export class ChatEngine {
	private turns: ChatTurn[] = [];
	private status: ChatStatus = 'idle';
	private error: string | undefined;
	private listeners: Set<Listener> = new Set();
	private requestId = 0;
	private abortController: AbortController | null = null;
	private context: string;
	private model: ModelConfig;
	private systemPrompt: string;

	constructor(context: string, model: ModelConfig, systemPrompt?: string) {
		this.context = context;
		this.model = model;
		this.systemPrompt = systemPrompt || DEFAULT_SYSTEM_PROMPT;
	}

	getState(): ChatState {
		return {
			turns: this.turns.slice(),
			status: this.status,
			error: this.error
		};
	}

	onChange(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		const state = this.getState();
		this.listeners.forEach(l => l(state));
	}

	setModel(model: ModelConfig): void {
		this.model = model;
	}

	setContext(context: string): void {
		this.context = context;
	}

	async send(content: string): Promise<void> {
		const trimmed = content.trim();
		if (!trimmed) return;
		if (this.status === 'sending') return;

		if (!this.model?.id) {
			this.error = 'Please configure an AI model in settings';
			this.status = 'error';
			this.notify();
			return;
		}

		const myRequestId = ++this.requestId;
		debugLog('Chat', `Send request #${myRequestId}: ${trimmed.slice(0, 50)}...`);

		this.turns.push({ role: 'user', content: trimmed });
		this.turns.push({ role: 'assistant', content: '' });
		this.status = 'sending';
		this.error = undefined;
		this.notify();

		this.abortController = new AbortController();

		try {
			const history = this.turns.slice(0, -2);
			const messages: ChatMessage[] = [];

			for (const turn of history) {
				messages.push({ role: turn.role, content: turn.content });
			}
			messages.push({ role: 'user', content: trimmed });

			const fullSystemPrompt = this.context
				? `${this.systemPrompt}\n\nReference information:\n${this.context}`
				: this.systemPrompt;

			const reply = await chatComplete({
				model: this.model,
				messages,
				system: fullSystemPrompt,
				signal: this.abortController.signal
			});

			if (myRequestId !== this.requestId) {
				debugLog('Chat', `Stale response #${myRequestId} dropped`);
				return;
			}

			const lastIndex = this.turns.length - 1;
			if (this.turns[lastIndex]?.role === 'assistant') {
				this.turns[lastIndex] = { role: 'assistant', content: reply };
			}
			this.status = 'done';
		} catch (err: any) {
			if (err?.name === 'AbortError') {
				debugLog('Chat', `Request #${myRequestId} aborted`);
				return;
			}
			if (myRequestId !== this.requestId) return;

			const lastIndex = this.turns.length - 1;
			if (this.turns[lastIndex]?.role === 'assistant' && !this.turns[lastIndex].content) {
				this.turns.pop();
			}
			this.status = 'error';
			this.error = err instanceof Error ? err.message : String(err);
			console.error('Chat send error:', err);
		} finally {
			this.abortController = null;
			if (myRequestId === this.requestId) {
				this.notify();
			}
		}
	}

	cancel(): void {
		if (this.status !== 'sending') return;
		this.abortController?.abort();
		this.status = 'idle';
		const lastIndex = this.turns.length - 1;
		if (this.turns[lastIndex]?.role === 'assistant' && !this.turns[lastIndex].content) {
			this.turns.pop();
		}
		this.notify();
	}

	clear(): void {
		this.abortController?.abort();
		this.abortController = null;
		this.turns = [];
		this.status = 'idle';
		this.error = undefined;
		this.notify();
	}

	async retry(): Promise<void> {
		let lastUserMessage = '';
		for (let i = this.turns.length - 1; i >= 0; i--) {
			if (this.turns[i].role === 'user') {
				lastUserMessage = this.turns[i].content;
				break;
			}
		}
		if (!lastUserMessage) return;

		if (this.status === 'error') {
			this.turns = this.turns.filter(t => !(t.role === 'assistant' && t.content === ''));
		}

		const turnsWithoutLastUser = this.turns.slice(0, -1);
		this.turns = turnsWithoutLastUser;
		this.status = 'idle';
		this.error = undefined;

		await this.send(lastUserMessage);
	}

	isIdle(): boolean {
		return this.status !== 'sending';
	}

	waitUntilIdle(): Promise<void> {
		return new Promise((resolve, reject) => {
			if (this.status !== 'sending') {
				if (this.status === 'error') {
					reject(new Error(this.error || 'Chat request failed'));
				} else {
					resolve();
				}
				return;
			}
			const off = this.onChange(state => {
				if (state.status !== 'sending') {
					off();
					if (state.status === 'error') {
						reject(new Error(state.error || 'Chat request failed'));
					} else {
						resolve();
					}
				}
			});
		});
	}
}

export function createChatProxy(turns: ChatTurn[]): ChatTurn[] {
	return [...turns];
}
