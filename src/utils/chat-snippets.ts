import { initializeIcons } from '../icons/icons';
import { Property } from '../types/types';
import { unescapeValue } from './string-utils';

export interface ChatSnippet {
	raw: string;
	label: string;
	icon: string;
	content: string;
}

export interface ChatValidationError {
	type: 'missing_quotes' | 'unclosed_quotes' | 'invalid_syntax';
	pattern: string;
	position: number;
	message: string;
}

const snippetRegex = /\{\{\s*chat\.snip:\s*"([\s\S]*?)"\s*\}\}/g;
const systemRegex = /\{\{\s*chat\.system:\s*"([\s\S]*?)"\s*\}\}/g;
const contextRegex = /\{\{\s*chat\.context:\s*"([\s\S]*?)"\s*\}\}/g;

const chatDefRegex = /\{\{\s*chat\.(?:snip|system|context):\s*"[\s\S]*?"\s*\}\}/g;

const snippetPatternRegex = /\{\{\s*chat\.snip:/g;
const systemPatternRegex = /\{\{\s*chat\.system:/g;
const contextPatternRegex = /\{\{\s*chat\.context:/g;

export function stripChatSnippets(text: string): string {
	if (!text) return text;
	return text.replace(chatDefRegex, '');
}

export function validateChatVariables(text: string): ChatValidationError[] {
	if (!text) return [];

	const errors: ChatValidationError[] = [];
	const patterns: Array<{ regex: RegExp; name: string; type: ChatValidationError['type'] }> = [
		{ regex: snippetPatternRegex, name: 'chat.snip', type: 'invalid_syntax' },
		{ regex: systemPatternRegex, name: 'chat.system', type: 'invalid_syntax' },
		{ regex: contextPatternRegex, name: 'chat.context', type: 'invalid_syntax' },
	];

	for (const { regex, name, type } of patterns) {
		regex.lastIndex = 0;
		let match;
		while ((match = regex.exec(text)) !== null) {
			const patternStart = match.index;
			const remainingText = text.substring(patternStart);
			const fullMatch = remainingText.match(/\{\{\s*chat\.(?:snip|system|context):\s*(.*?)\}\}/);

			if (!fullMatch) {
				errors.push({
					type: 'unclosed_quotes',
					pattern: name,
					position: patternStart,
					message: `${name}: 缺少闭合的 }}`
				});
				continue;
			}

			const content = fullMatch[1];
			if (!content.startsWith('"')) {
				errors.push({
					type: 'missing_quotes',
					pattern: name,
					position: patternStart,
					message: `${name}: 内容需要用双引号包裹`
				});
				continue;
			}

			const quoteMatch = content.match(/^"([\s\S]*?)"$/);
			if (!quoteMatch) {
				errors.push({
					type: 'unclosed_quotes',
					pattern: name,
					position: patternStart,
					message: `${name}: 未闭合的双引号`
				});
			}
		}
	}

	return errors;
}

export function extractChatSystem(
	templateContent: string,
	properties?: Property[]
): string | undefined {
	const sources = collectSources(templateContent, properties);
	for (const source of sources) {
		const match = systemRegex.exec(source);
		if (match) return match[1];
		systemRegex.lastIndex = 0;
	}
	return undefined;
}

export function extractChatContext(
	templateContent: string,
	properties?: Property[]
): string | undefined {
	const sources = collectSources(templateContent, properties);
	for (const source of sources) {
		const match = contextRegex.exec(source);
		if (match) return match[1];
		contextRegex.lastIndex = 0;
	}
	return undefined;
}

function collectSources(templateContent: string, properties?: Property[]): string[] {
	const sources: string[] = [templateContent || ''];
	if (properties) {
		for (const prop of properties) {
			sources.push(unescapeValue(String(prop.value || '')));
		}
	}
	return sources;
}

const iconMap: Array<{ keywords: string[]; icon: string }> = [
	{ keywords: ['总结', 'summary', 'summarize', '摘要'], icon: 'file-text' },
	{ keywords: ['翻译', 'translate', 'translation'], icon: 'languages' },
	{ keywords: ['标签', 'tag', 'label'], icon: 'tags' },
	{ keywords: ['提取', 'extract'], icon: 'scan-line' },
	{ keywords: ['问题', 'question', '反思'], icon: 'help-circle' },
	{ keywords: ['列表', 'list', '要点'], icon: 'list' },
	{ keywords: ['代码', 'code'], icon: 'code' },
	{ keywords: ['标题', 'title', 'headline'], icon: 'heading' },
];

function detectIcon(label: string): string {
	const lower = label.toLowerCase();
	for (const entry of iconMap) {
		for (const kw of entry.keywords) {
			if (lower.includes(kw.toLowerCase())) {
				return entry.icon;
			}
		}
	}
	return 'message-square';
}

function generateLabel(content: string): string {
	const firstLine = content.split('\n')[0].trim();
	if (firstLine.length <= 30) return firstLine;
	return firstLine.slice(0, 30) + '...';
}

export function extractChatSnippets(
	templateContent: string,
	properties?: Property[]
): ChatSnippet[] {
	const snippets: ChatSnippet[] = [];
	const seen = new Set<string>();

	const sources: string[] = [templateContent || ''];
	if (properties) {
		for (const prop of properties) {
			sources.push(unescapeValue(String(prop.value || '')));
		}
	}

	for (const source of sources) {
		let match: RegExpExecArray | null;
		snippetRegex.lastIndex = 0;
		while ((match = snippetRegex.exec(source)) !== null) {
			const raw = match[1];
			if (seen.has(raw)) continue;
			seen.add(raw);
			const label = generateLabel(raw);
			const icon = detectIcon(label);
			snippets.push({ raw, label, icon, content: raw });
		}
	}

	return snippets;
}

function insertAtCursor(input: HTMLTextAreaElement, text: string): void {
	const start = input.selectionStart;
	const end = input.selectionEnd;
	const before = input.value.substring(0, start);
	const after = input.value.substring(end);

	const cleanedBefore = before.replace(/\/[^\s]*$/, '');

	input.value = cleanedBefore + text + after;
	const newPos = cleanedBefore.length + text.length;
	input.setSelectionRange(newPos, newPos);
	input.focus();
}

export class SnippetPicker {
	private snippets: ChatSnippet[];
	private inputEl: HTMLTextAreaElement;
	private menuEl: HTMLElement | null;
	private visible: boolean = false;
	private selectedIndex: number = 0;
	private filtered: ChatSnippet[] = [];
	private onSelect?: (snippet: ChatSnippet) => void;
	private documentClickListener: ((e: MouseEvent) => void) | null = null;
	private keyDownListener: ((e: KeyboardEvent) => void) | null = null;

	constructor(
		snippets: ChatSnippet[],
		inputEl: HTMLTextAreaElement,
		onSelect?: (snippet: ChatSnippet) => void
	) {
		this.snippets = snippets;
		this.inputEl = inputEl;
		this.onSelect = onSelect;
		this.menuEl = inputEl.parentElement?.querySelector('#chat-snippet-menu') || null;
		this.filtered = snippets;
	}

	bind(): void {
		this.inputEl.addEventListener('input', this.handleInput);
		this.keyDownListener = this.handleKeyDown.bind(this);
		this.inputEl.addEventListener('keydown', this.keyDownListener);
		this.documentClickListener = this.handleDocumentClick.bind(this);
		document.addEventListener('click', this.documentClickListener);
	}

	unbind(): void {
		this.inputEl.removeEventListener('input', this.handleInput);
		if (this.keyDownListener) {
			this.inputEl.removeEventListener('keydown', this.keyDownListener);
			this.keyDownListener = null;
		}
		if (this.documentClickListener) {
			document.removeEventListener('click', this.documentClickListener);
			this.documentClickListener = null;
		}
		this.hide();
	}

	setSnippets(snippets: ChatSnippet[]): void {
		this.snippets = snippets;
		this.filtered = snippets;
	}

	private handleInput = (): void => {
		const value = this.inputEl.value;
		const cursorPos = this.inputEl.selectionStart;
		const textBefore = value.substring(0, cursorPos);
		const match = textBefore.match(/\/(\S*)$/);

		if (match && this.snippets.length > 0) {
			const query = match[1].toLowerCase();
			this.filtered = query
				? this.snippets.filter(s => s.label.toLowerCase().includes(query))
				: [...this.snippets];
			this.selectedIndex = 0;
			this.show();
		} else {
			this.hide();
		}
	};

	private handleKeyDown = (e: KeyboardEvent): void => {
		if (!this.visible) return;
		if (this.filtered.length === 0) return;

		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				this.selectedIndex = Math.min(this.selectedIndex + 1, this.filtered.length - 1);
				this.renderMenu();
				break;
			case 'ArrowUp':
				e.preventDefault();
				this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
				this.renderMenu();
				break;
			case 'Enter':
			case 'Tab':
				e.preventDefault();
				this.insert(this.filtered[this.selectedIndex]);
				break;
			case 'Escape':
				e.preventDefault();
				this.hide();
				break;
		}
	};

	private handleDocumentClick = (e: MouseEvent): void => {
		if (!this.visible) return;
		const target = e.target as Node;
		if (this.menuEl && this.menuEl.contains(target)) return;
		if (this.inputEl.contains(target)) return;
		this.hide();
	};

	show(): void {
		if (this.filtered.length === 0) {
			this.hide();
			return;
		}
		this.visible = true;
		this.selectedIndex = 0;
		if (this.menuEl) {
			this.menuEl.style.display = 'block';
			this.renderMenu();
		}
	}

	hide(): void {
		this.visible = false;
		if (this.menuEl) {
			this.menuEl.style.display = 'none';
		}
	}

	private renderMenu(): void {
		if (!this.menuEl) return;
		const html = this.filtered.map((snippet, i) => {
			const cls = [
				'chat-snippet-item',
				i === this.selectedIndex ? 'is-selected' : ''
			].filter(Boolean).join(' ');
			return `
				<div class="${cls}" data-index="${i}">
					<i data-lucide="${snippet.icon}"></i>
					<div class="chat-snippet-text">
						<div class="chat-snippet-label">${this.escapeHtml(snippet.label)}</div>
					</div>
				</div>
			`;
		}).join('');
		this.menuEl.innerHTML = html;
		initializeIcons(this.menuEl);

		const items = this.menuEl.querySelectorAll('.chat-snippet-item');
		items.forEach((item, i) => {
			item.addEventListener('mousedown', (e) => {
				e.preventDefault();
				this.insert(this.filtered[i]);
			});
			item.addEventListener('mouseenter', () => {
				this.selectedIndex = i;
				this.renderMenu();
			});
		});
	}

	insert(snippet: ChatSnippet): void {
		insertAtCursor(this.inputEl, snippet.content);
		this.hide();
		if (this.onSelect) {
			this.onSelect(snippet);
		}
	}

	private escapeHtml(text: string): string {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}
}