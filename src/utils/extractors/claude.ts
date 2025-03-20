import { BaseExtractor, ExtractorResult } from './_base';
import { Defuddle } from 'defuddle';

export class ClaudeExtractor extends BaseExtractor {
	private articles: NodeListOf<Element> | null;

	constructor(document: Document, url: string) {
		super(document, url);
		// Find all message blocks - both user and assistant messages
		this.articles = document.querySelectorAll('div[data-testid="user-message"], div[data-testid="assistant-message"], div.font-claude-message');
	}

	canExtract(): boolean {
		return !!this.articles && this.articles.length > 0;
	}

	extract(): ExtractorResult {
		const turns = this.extractConversationTurns();
		const title = this.getTitle();
		const rawContentHtml = this.createContentHtml(turns);

		// Create a temporary document to run Defuddle on our content
		const tempDoc = document.implementation.createHTMLDocument();
		const container = tempDoc.createElement('article');
		container.innerHTML = rawContentHtml;
		tempDoc.body.appendChild(container);

		// Run Defuddle on our formatted content
		const defuddled = new Defuddle(tempDoc).parse();
		const contentHtml = defuddled.content;

		return {
			content: contentHtml,
			contentHtml: contentHtml,
			extractedContent: {
				turns: turns.length.toString(),
			},
			variables: {
				title: title,
				site: 'Claude',
				description: `Claude conversation with ${turns.length} turns`,
				author: 'Claude',
				wordCount: defuddled.wordCount?.toString() || '',
			}
		};
	}

	private extractConversationTurns(): { role: string; content: string }[] {
		const turns: { role: string; content: string }[] = [];

		if (!this.articles) return turns;

		this.articles.forEach((article) => {
			let role: string;
			let content: string;

			if (article.hasAttribute('data-testid')) {
				// Handle user messages
				if (article.getAttribute('data-testid') === 'user-message') {
					role = 'you';
					content = article.innerHTML;
				}
				// Skip non-message elements
				else {
					return;
				}
			} else if (article.classList.contains('font-claude-message')) {
				// Handle Claude messages
				role = 'assistant';
				content = article.innerHTML;
			} else {
				// Skip unknown elements
				return;
			}

			if (content) {
				turns.push({
					role,
					content: content.trim()
				});
			}
		});

		return turns;
	}

	private createContentHtml(turns: { role: string; content: string }[]): string {
		return turns.map((turn, index) => {
			const displayRole = turn.role === 'you' ? 'You' : 'Claude';
			return `
			<div class="claude-turn claude-${turn.role}">
				<div class="claude-role"><h2>${displayRole}</h2></div>
				<div class="claude-content">
					${turn.content}
				</div>
			</div>${index < turns.length - 1 ? '\n<hr>' : ''}`;
		}).join('\n').trim();
	}

	private getTitle(): string {
		// Try to get the page title first
		const pageTitle = this.document.title?.trim();
		if (pageTitle && pageTitle !== 'Claude') {
			// Remove ' - Claude' suffix if present
			return pageTitle.replace(/ - Claude$/, '');
		}

		// Try to get title from header
		const headerTitle = this.document.querySelector('header .font-tiempos')?.textContent?.trim();
		if (headerTitle) {
			return headerTitle;
		}

		// Fall back to first user message
		const firstUserMessage = this.articles?.item(0)?.querySelector('[data-testid="user-message"]');
		if (firstUserMessage) {
			const text = firstUserMessage.textContent || '';
			// Truncate to first 50 characters if longer
			return text.length > 50 ? text.slice(0, 50) + '...' : text;
		}

		return 'Claude Conversation';
	}
} 