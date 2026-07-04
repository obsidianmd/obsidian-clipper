import { ChatEngine, ChatState, ChatTurn } from './chat-engine';
import { formatDuration } from '../../utils/string-utils';
import { t } from './chat-i18n';
import { initializeIcons } from '../../icons/icons';
import { debugLog } from '../../utils/debug';
import { ModelConfig } from '../../types/types';
import { ChatSnippet, SnippetPicker } from './chat-snippets';

function renderMarkdown(text: string): string {
	let html = text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');

	const codeBlocks: string[] = [];
	html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, _lang, code) => {
		const placeholder = `\u0000CODEBLOCK${codeBlocks.length}\u0000`;
		codeBlocks.push(`<pre class="chat-md-codeblock"><code>${code.replace(/\n$/, '')}</code></pre>`);
		return placeholder;
	});

	const inlineCodes: string[] = [];
	html = html.replace(/`([^`\n]+)`/g, (_m, code) => {
		const placeholder = `\u0000INLINECODE${inlineCodes.length}\u0000`;
		inlineCodes.push(`<code class="chat-md-code">${code}</code>`);
		return placeholder;
	});

	html = html.replace(/^######\s+(.+)$/gm, '<h6 class="chat-md-h">$1</h6>');
	html = html.replace(/^#####\s+(.+)$/gm, '<h5 class="chat-md-h">$1</h5>');
	html = html.replace(/^####\s+(.+)$/gm, '<h4 class="chat-md-h">$1</h4>');
	html = html.replace(/^###\s+(.+)$/gm, '<h3 class="chat-md-h">$1</h3>');
	html = html.replace(/^##\s+(.+)$/gm, '<h2 class="chat-md-h">$1</h2>');
	html = html.replace(/^#\s+(.+)$/gm, '<h1 class="chat-md-h">$1</h1>');

	html = html.replace(/^---+$/gm, '<hr class="chat-md-hr"/>');

	html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
	html = html.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
	html = html.replace(/(^|[\s(])_([^_\n]+)_/g, '$1<em>$2</em>');

	html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

	const lines = html.split('\n');
	const result: string[] = [];
	let listType: 'ul' | 'ol' | null = null;
	let inBlockquote = false;
	let inTable = false;
	let tableRows: string[][] = [];

	const closeList = () => {
		if (listType) {
			result.push(`</${listType}>`);
			listType = null;
		}
	};
	const closeBlockquote = () => {
		if (inBlockquote) {
			result.push('</blockquote>');
			inBlockquote = false;
		}
	};
	const isTableSeparator = (line: string) => /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(line);
	const isTableRow = (line: string) => line.includes('|') && !isTableSeparator(line);
	const parseTableRow = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
	const flushTable = () => {
		if (!inTable || tableRows.length < 2) { inTable = false; tableRows = []; return; }
		const header = tableRows[0];
		const bodyRows = tableRows.slice(2);
		let tableHtml = '<table class="chat-md-table">';
		tableHtml += '<thead><tr>';
		for (const cell of header) tableHtml += `<th>${cell}</th>`;
		tableHtml += '</tr></thead>';
		tableHtml += '<tbody>';
		for (const row of bodyRows) {
			tableHtml += '<tr>';
			for (let i = 0; i < header.length; i++) {
				tableHtml += `<td>${row[i] ?? ''}</td>`;
			}
			tableHtml += '</tr>';
		}
		tableHtml += '</tbody></table>';
		result.push(tableHtml);
		inTable = false;
		tableRows = [];
	};

	for (const line of lines) {
		const trimmed = line.trim();

		const ulMatch = trimmed.match(/^[-*+]\s+(.+)$/);
		const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);

		if (ulMatch) {
			flushTable();
			closeBlockquote();
			if (listType !== 'ul') { closeList(); result.push('<ul class="chat-md-ul">'); listType = 'ul'; }
			result.push(`<li class="chat-md-li">${ulMatch[1]}</li>`);
			continue;
		}
		if (olMatch) {
			flushTable();
			closeBlockquote();
			if (listType !== 'ol') { closeList(); result.push('<ol class="chat-md-ol">'); listType = 'ol'; }
			result.push(`<li class="chat-md-li">${olMatch[1]}</li>`);
			continue;
		}

		const bqMatch = trimmed.match(/^>\s?(.*)$/);
		if (bqMatch) {
			flushTable();
			closeList();
			if (!inBlockquote) { result.push('<blockquote>'); inBlockquote = true; }
			if (bqMatch[1]) result.push(`<p class="chat-md-p">${bqMatch[1]}</p>`);
			continue;
		}

		if (inTable) {
			if (trimmed === '' || !isTableRow(trimmed)) {
				flushTable();
			} else {
				tableRows.push(parseTableRow(trimmed));
				continue;
			}
		} else if (isTableRow(trimmed) && trimmed.startsWith('|')) {
			closeList();
			closeBlockquote();
			inTable = true;
			tableRows = [parseTableRow(trimmed)];
			continue;
		}

		closeList();
		closeBlockquote();

		if (trimmed === '') {
			continue;
		} else if (/^<(pre|h\d|ul|ol|hr|blockquote|table)/.test(trimmed)) {
			result.push(trimmed);
		} else {
			result.push(`<p class="chat-md-p">${trimmed}</p>`);
		}
	}
	closeList();
	closeBlockquote();
	flushTable();

	let out = result.join('\n');

	out = out.replace(/\u0000CODEBLOCK(\d+)\u0000/g, (_m, i) => codeBlocks[parseInt(i, 10)]);
	out = out.replace(/\u0000INLINECODE(\d+)\u0000/g, (_m, i) => inlineCodes[parseInt(i, 10)]);

	return out;
}

export interface ChatUIOptions {
	container: HTMLElement;
	engine: ChatEngine;
	onChange: (state: ChatState) => void;
	onModelChange?: (model: ModelConfig) => void;
	onClear?: () => void;
	onCollapse?: (collapsed: boolean) => void;
	models: ModelConfig[];
	initialModelId: string;
	snippets?: ChatSnippet[];
	collapsed?: boolean;
}

export class ChatUI {
	private engine: ChatEngine;
	private container: HTMLElement;
	private headerEl: HTMLElement | null;
	private collapseBtn: HTMLButtonElement | null;
	private clearBtn: HTMLButtonElement | null;
	private messagesEl: HTMLElement | null;
	private inputEl: HTMLTextAreaElement | null;
	private sendBtn: HTMLButtonElement | null;
	private modelSelectEl: HTMLSelectElement | null;
	private timerEl: HTMLElement | null;
	private onChange: (state: ChatState) => void;
	private onModelChange?: (model: ModelConfig) => void;
	private onClear?: () => void;
	private onCollapse?: (collapsed: boolean) => void;
	private models: ModelConfig[];
	private snippets: ChatSnippet[];
	private snippetPicker: SnippetPicker | null = null;
	private collapsed: boolean = false;
	private startTime = 0;
	private timerInterval: number | undefined;
	private bound: boolean = false;

	constructor(options: ChatUIOptions) {
		this.engine = options.engine;
		this.container = options.container;
		this.onChange = options.onChange;
		this.onModelChange = options.onModelChange;
		this.onClear = options.onClear;
		this.onCollapse = options.onCollapse;
		this.models = options.models;
		this.snippets = options.snippets || [];
		this.collapsed = !!options.collapsed;
		this.headerEl = this.container.querySelector('#chat-header');
		this.collapseBtn = this.container.querySelector('#chat-collapse-btn') as HTMLButtonElement | null;
		this.clearBtn = this.container.querySelector('#chat-clear-btn') as HTMLButtonElement | null;
		this.messagesEl = this.container.querySelector('#chat-messages');
		this.inputEl = this.container.querySelector('#chat-input') as HTMLTextAreaElement | null;
		this.sendBtn = this.container.querySelector('#chat-send-btn') as HTMLButtonElement | null;
		this.modelSelectEl = this.container.querySelector('#chat-model-select') as HTMLSelectElement | null;
		this.timerEl = this.container.querySelector('#chat-timer');

		if (this.modelSelectEl && options.models.length > 0) {
			this.modelSelectEl.style.display = 'inline-block';
			this.modelSelectEl.textContent = '';
			options.models.forEach(model => {
				const option = document.createElement('option');
				option.value = model.id;
				option.textContent = model.name;
				this.modelSelectEl!.appendChild(option);
			});
			this.modelSelectEl.value = options.initialModelId || options.models[0].id;
		}

		if (this.collapsed) {
			this.container.classList.add('is-collapsed');
		}
	}

	private setCollapseIcon(name: string): void {
		if (!this.collapseBtn) return;
		this.collapseBtn.querySelectorAll('i, svg').forEach(el => el.remove());
		const icon = document.createElement('i');
		icon.setAttribute('data-lucide', name);
		this.collapseBtn.appendChild(icon);
		initializeIcons(this.collapseBtn);
	}

	bind(): void {
		if (this.bound) return;
		this.bound = true;

		initializeIcons(this.container);

		this.setCollapseIcon(this.collapsed ? 'chevron-up' : 'chevron-down');

		if (this.sendBtn) {
			this.sendBtn.style.display = 'inline-block';
			this.sendBtn.addEventListener('click', this.handleSend);
		}

		if (this.inputEl) {
			this.inputEl.addEventListener('keydown', this.handleKeydown);
		}

		if (this.modelSelectEl) {
			this.modelSelectEl.addEventListener('change', this.handleModelChange);
		}

		if (this.clearBtn) {
			this.clearBtn.addEventListener('click', this.handleClear);
		}

		if (this.collapseBtn) {
			this.collapseBtn.addEventListener('click', this.handleCollapse);
		}

		if (this.snippets.length > 0 && this.inputEl) {
			this.snippetPicker = new SnippetPicker(this.snippets, this.inputEl);
			this.snippetPicker.bind();
		}

		this.engine.onChange(this.handleStateChange);
		this.render(this.engine.getState());
	}

	unbind(): void {
		if (!this.bound) return;
		this.bound = false;

		if (this.sendBtn) {
			this.sendBtn.removeEventListener('click', this.handleSend);
		}
		if (this.inputEl) {
			this.inputEl.removeEventListener('keydown', this.handleKeydown);
		}
		if (this.modelSelectEl) {
			this.modelSelectEl.removeEventListener('change', this.handleModelChange);
		}
		if (this.clearBtn) {
			this.clearBtn.removeEventListener('click', this.handleClear);
		}
		if (this.collapseBtn) {
			this.collapseBtn.removeEventListener('click', this.handleCollapse);
		}
		if (this.snippetPicker) {
			this.snippetPicker.unbind();
			this.snippetPicker = null;
		}
		if (this.timerInterval) {
			clearInterval(this.timerInterval);
			this.timerInterval = undefined;
		}
		this.stopErrorCountdown();
	}

	private handleSend = async (): Promise<void> => {
		const status = this.engine.getState().status;
		if (status === 'sending') {
			this.engine.cancel();
			return;
		}
		if (status === 'error') {
			await this.engine.retry();
			return;
		}

		const text = this.inputEl?.value || '';
		if (!text.trim()) return;

		if (this.inputEl) {
			this.inputEl.value = '';
		}

		await this.engine.send(text);
	};

	private handleKeydown = (e: KeyboardEvent): void => {
		if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
			e.preventDefault();
			this.handleSend();
		}
	};

	private handleModelChange = (): void => {
		const selectedId = this.modelSelectEl?.value;
		if (!selectedId) return;
		const model = this.models.find(m => m.id === selectedId);
		if (model && this.onModelChange) {
			this.onModelChange(model);
		}
		this.engine.setModel(model!);
	};

	private handleClear = (): void => {
		this.engine.clear();
		if (this.onClear) {
			this.onClear();
		}
	};

	private handleCollapse = (): void => {
		this.collapsed = !this.collapsed;
		if (this.collapsed) {
			this.container.classList.add('is-collapsed');
			this.setCollapseIcon('chevron-up');
		} else {
			this.container.classList.remove('is-collapsed');
			this.setCollapseIcon('chevron-down');
		}
		if (this.onCollapse) {
			this.onCollapse(this.collapsed);
		}
	};

	private handleStateChange = (state: ChatState): void => {
		this.render(state);
		this.onChange(state);
	};

	private render(state: ChatState): void {
		this.renderMessages(state.turns, state.status, state.error);
		this.renderControls(state.status, state.error);
		this.renderTimer(state.status);
	}

	private renderMessages(turns: ChatTurn[], status: string, error?: string): void {
		if (!this.messagesEl) return;

		const emptyText = t('chatEmpty') || 'Ask AI about the current page';
		this.messagesEl.setAttribute('data-empty-text', emptyText);

		const html = turns.map((turn) => {
			if (turn.role === 'assistant' && !turn.content) {
				return '';
			}
			const contentHtml = turn.role === 'user'
				? this.escapeHtml(turn.content)
				: renderMarkdown(turn.content);
			const cls = [
				'chat-turn',
				turn.role === 'user' ? 'is-user' : 'is-assistant'
			].filter(Boolean).join(' ');
			return `<div class="${cls}">${contentHtml}</div>`;
		}).join('');

		let errorHtml = '';
		if (status === 'error' && error) {
			errorHtml = `<div class="chat-turn is-error">
				<div class="chat-error-icon">
					<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
				</div>
				<div class="chat-error-text">${this.escapeHtml(error)}</div>
			</div>`;
		}

		const finalHtml = html + errorHtml;
		if (!finalHtml.trim()) {
			this.messagesEl.innerHTML = '';
			return;
		}

		const wasAtBottom = this.isAtBottom();
		this.messagesEl.innerHTML = finalHtml;

		if (wasAtBottom) {
			this.scrollToBottom(true);
		}
	}

	private isAtBottom(threshold: number = 50): boolean {
		if (!this.messagesEl) return true;
		const { scrollHeight, scrollTop, clientHeight } = this.messagesEl;
		return scrollHeight - scrollTop <= clientHeight + threshold;
	}

	private scrollToBottom(smooth: boolean = true): void {
		if (!this.messagesEl) return;
		this.messagesEl.scrollTo({
			top: this.messagesEl.scrollHeight,
			behavior: smooth ? 'smooth' : 'auto'
		});
	}

	private renderControls(status: string, error?: string): void {
		const sending = status === 'sending';
		const isError = status === 'error';

		this.container.classList.remove('sending', 'error');
		if (sending) this.container.classList.add('sending');
		else if (isError) this.container.classList.add('error');

		if (this.sendBtn) {
			this.sendBtn.classList.remove('is-stopping', 'is-error');
			if (sending) {
				this.sendBtn.classList.add('is-stopping');
				this.sendBtn.textContent = t('thinking') || 'Thinking';
				this.sendBtn.disabled = false;
			} else if (isError) {
				this.sendBtn.classList.add('is-error');
				this.sendBtn.textContent = t('retry') || 'Retry';
				this.sendBtn.disabled = false;
			} else {
				this.sendBtn.textContent = t('send') || 'Send';
				this.sendBtn.disabled = false;
			}
		}

		if (this.inputEl) {
			this.inputEl.disabled = sending;
		}

		if (this.modelSelectEl) {
			this.modelSelectEl.style.display = this.models.length > 0 ? '' : 'none';
		}

		if (this.timerEl) {
			if (sending) {
				this.timerEl.style.display = 'inline';
			} else {
				this.timerEl.textContent = '';
				this.timerEl.style.display = 'none';
			}
		}

		if (isError && error) {
			if (this.currentError !== error) {
				this.currentError = error;
				this.startErrorCountdown(error);
			}
		} else {
			this.currentError = null;
			this.stopErrorCountdown();
		}
	}

	private errorCountdownTimer: number | null = null;
	private currentError: string | null = null;
	private stopErrorCountdown(): void {
		if (this.errorCountdownTimer) {
			clearInterval(this.errorCountdownTimer);
			this.errorCountdownTimer = null;
		}
	}

	private startErrorCountdown(error: string): void {
		this.stopErrorCountdown();
		const rateLimitMatch = error.match(/wait (\d+) seconds?/i);
		if (!rateLimitMatch || !this.sendBtn) return;

		let remaining = parseInt(rateLimitMatch[1], 10);
		if (isNaN(remaining) || remaining <= 0) return;

		const originalText = t('retry') || 'Retry';
		const updateBtn = () => {
			if (!this.sendBtn) return;
			if (remaining > 0) {
				this.sendBtn.textContent = `${originalText} ${remaining}s`;
				this.sendBtn.disabled = true;
				remaining--;
			} else {
				this.sendBtn.textContent = originalText;
				this.sendBtn.disabled = false;
				this.stopErrorCountdown();
			}
		};
		updateBtn();
		this.errorCountdownTimer = window.setInterval(updateBtn, 1000);
	}

	private renderTimer(status: string): void {
		if (status === 'sending') {
			this.startTime = performance.now();
			if (this.timerEl) {
				this.timerEl.textContent = formatDuration(0);
			}
			if (this.timerInterval) clearInterval(this.timerInterval);
			this.timerInterval = window.setInterval(() => {
				if (this.timerEl) {
					this.timerEl.textContent = formatDuration(performance.now() - this.startTime);
				}
			}, 10);
		} else {
			if (this.timerInterval) {
				clearInterval(this.timerInterval);
				this.timerInterval = undefined;
			}
		}
	}

	private escapeHtml(text: string): string {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}

	setModels(models: ModelConfig[], initialModelId: string): void {
		this.models = models;
		if (this.modelSelectEl) {
			this.modelSelectEl.textContent = '';
			models.forEach(model => {
				const option = document.createElement('option');
				option.value = model.id;
				option.textContent = model.name;
				this.modelSelectEl!.appendChild(option);
			});
			this.modelSelectEl.value = initialModelId || models[0]?.id || '';
		}
	}

	setSnippets(snippets: ChatSnippet[]): void {
		this.snippets = snippets;
		if (this.snippetPicker) {
			this.snippetPicker.setSnippets(snippets);
		} else if (this.bound && snippets.length > 0 && this.inputEl) {
			this.snippetPicker = new SnippetPicker(snippets, this.inputEl);
			this.snippetPicker.bind();
		}
	}
}

export function hasChatVariable(templateContent: string, properties?: { name: string; value: string }[]): boolean {
	const chatRegex = /\{\{\s*chat[^\}]*\}\}/;
	if (chatRegex.test(templateContent)) return true;
	if (properties) {
		for (const prop of properties) {
			if (chatRegex.test(prop.value)) return true;
		}
	}
	return false;
}
