import { BaseExtractor, ExtractorResult } from './_base';
import { Defuddle } from 'defuddle';

export class ChatGPTExtractor extends BaseExtractor {
	private articles: NodeListOf<Element> | null;

	constructor(document: Document, url: string) {
		super(document, url);
		this.articles = document.querySelectorAll('article[data-testid^="conversation-turn-"]');
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
		const container = tempDoc.createElement('div');
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
				title: defuddled.title || title,
				site: 'ChatGPT',
				description: `ChatGPT conversation with ${turns.length} turns`,
				published: defuddled.published || '',
				author: 'ChatGPT',
				wordCount: defuddled.wordCount?.toString() || '',
			}
		};
	}

	private extractConversationTurns(): { role: string; content: string }[] {
		const turns: { role: string; content: string }[] = [];

		if (!this.articles) return turns;

		this.articles.forEach((article) => {
			const role = article.querySelector('h5, h6')?.textContent?.replace(' said:', '') || 'unknown';
			const content = article.querySelector('.markdown')?.innerHTML || 
						   article.querySelector('.text-message')?.innerHTML || '';

			if (content) {
				turns.push({
					role: role.toLowerCase(),
					content: content.trim()
				});
			}
		});

		return turns;
	}

	private createContentHtml(turns: { role: string; content: string }[]): string {
		return turns.map((turn, index) => {
			const displayRole = turn.role === 'you' ? 'You' : 'ChatGPT';
			return `
			<div class="chatgpt-turn chatgpt-${turn.role}">
				<div class="chatgpt-role"><h2>${displayRole}</h2></div>
				<div class="chatgpt-content">
					${turn.content}
				</div>
			</div>${index < turns.length - 1 ? '\n<hr>' : ''}`;
		}).join('\n').trim();
	}

	private getTitle(): string {
		// Try to get the page title first
		const pageTitle = this.document.title?.trim();
		if (pageTitle && pageTitle !== 'ChatGPT') {
			return pageTitle;
		}

		// Fall back to first user message
		const firstUserTurn = this.articles?.item(0)?.querySelector('.text-message');
		if (firstUserTurn) {
			const text = firstUserTurn.textContent || '';
			// Truncate to first 50 characters if longer
			return text.length > 50 ? text.slice(0, 50) + '...' : text;
		}

		return 'ChatGPT Conversation';
	}
} 