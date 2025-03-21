import { BaseExtractor, ExtractorResult } from './_base';
import { Defuddle } from 'defuddle';

export class ChatGPTExtractor extends BaseExtractor {
	private articles: NodeListOf<Element> | null;
	private footnotes: { url: string; text: string }[];
	private footnoteCounter: number;

	constructor(document: Document, url: string) {
		super(document, url);
		this.articles = document.querySelectorAll('article[data-testid^="conversation-turn-"]');
		this.footnotes = [];
		this.footnoteCounter = 0;
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
		const defuddled = new Defuddle(tempDoc, {debug: true}).parse();
		const contentHtml = defuddled.content;

		return {
			content: contentHtml,
			contentHtml: contentHtml,
			extractedContent: {
				turns: turns.length.toString(),
			},
			variables: {
				title: title,
				site: 'ChatGPT',
				description: `ChatGPT conversation with ${turns.length} turns`,
				author: 'ChatGPT',
				wordCount: defuddled.wordCount?.toString() || '',
			}
		};
	}

	private extractConversationTurns(): { role: string; content: string }[] {
		const turns: { role: string; content: string }[] = [];
		this.footnotes = [];
		this.footnoteCounter = 0;

		if (!this.articles) return turns;

		this.articles.forEach((article) => {
			const roleElement = article.querySelector('h5, h6');
			const role = roleElement?.textContent?.toLowerCase().replace(' said:', '') || 'unknown';
			
			// Find all message containers within this article
			const messageContainers = article.querySelectorAll('[data-message-author-role]');
			if (!messageContainers.length) return;

			// For research messages, we need to combine multiple message blocks
			let combinedContent = '';

			messageContainers.forEach((messageContainer) => {
				const authorRole = messageContainer.getAttribute('data-message-author-role');
				let messageContent = '';

				if (authorRole === 'user') {
					// For user messages, look for the content in the whitespace-pre-wrap div
					const userContent = messageContainer.querySelector('.whitespace-pre-wrap');
					messageContent = userContent?.innerHTML || '';
				} else if (authorRole === 'assistant') {
					// For assistant messages, look for markdown content
					const markdownContent = messageContainer.querySelector('.markdown');
					messageContent = markdownContent?.innerHTML || '';
				}

				if (messageContent) {
					// If this is part of a research message, add it to the combined content
					if (messageContainer.getAttribute('data-message-model-slug') === 'research') {
						// Add research completion info if present
						const researchInfo = article.querySelector('.border-token-border-primary');
						if (researchInfo && !combinedContent.includes(researchInfo.outerHTML)) {
							combinedContent += researchInfo.outerHTML;
						}
					}
					combinedContent += messageContent;
				}
			});

			// If we have content to add
			if (combinedContent) {
				// Process inline references
				const tempDiv = document.createElement('div');
				tempDiv.innerHTML = combinedContent;
				
				// Find all reference links within their containers
				const references = tempDiv.querySelectorAll('.relative.inline-flex a[href^="http"]');
				references.forEach(ref => {
					const inlineFlexContainer = ref.closest('.relative.inline-flex');
					if (inlineFlexContainer) {
						const url = ref.getAttribute('href') || '';
						let domain = '';
						let fragmentText = '';
						
						try {
							// Extract domain without www.
							domain = new URL(url).hostname.replace(/^www\./, '');
							
							// Extract and decode the fragment text if it exists
							const hashParts = url.split('#:~:text=');
							if (hashParts.length > 1) {
								fragmentText = decodeURIComponent(hashParts[1]);
								// Replace URL-encoded commas and clean up
								fragmentText = fragmentText.replace(/%2C/g, ',');
								
								// Split the fragment into start and end if it contains a comma
								const parts = fragmentText.split(',');
								if (parts.length > 1) {
									// Only show first part with ellipsis
									fragmentText = ` — ${parts[0].trim()}...`;
								} else {
									// If no comma, just wrap the whole text
									fragmentText = ` — ${fragmentText.trim()}`;
								}
							}
						} catch (e) {
							domain = url;
						}

						// Check if this URL already exists in our footnotes
						let footnoteIndex = this.footnotes.findIndex(fn => fn.url === url);
						if (footnoteIndex === -1) {
							// Only create new footnote if URL doesn't exist
							this.footnoteCounter++;
							footnoteIndex = this.footnoteCounter;  // Keep it 1-based
							this.footnotes.push({ 
								url, 
								text: `<a href="${url}">${domain}</a>${fragmentText}`
							});
						} else {
							// Use existing footnote index (already 1-based since we never subtracted 1)
							footnoteIndex++;
						}
						
						// Create footnote reference using the correct index
						const footnoteRef = document.createElement('sup');
						footnoteRef.id = `fnref:${footnoteIndex}`;
						footnoteRef.innerHTML = `<a href="#fn:${footnoteIndex}">${footnoteIndex}</a>`;
						
						// Find the parent span if it exists
						const parentSpan = inlineFlexContainer.closest('span[data-state="closed"]');
						const containerToReplace = parentSpan || inlineFlexContainer;

						// Replace the container with the footnote
						containerToReplace.replaceWith(footnoteRef);
					}
				});

				// Clean up any ZeroWidthSpace characters that might break flow
				tempDiv.innerHTML = tempDiv.innerHTML.replace(/\u200B/g, '');

				// Clean up any empty spans that might have contained references
				const emptySpans = tempDiv.querySelectorAll('span:empty');
				emptySpans.forEach(span => span.remove());

				turns.push({
					role: role,
					content: tempDiv.innerHTML.trim()
				});
			}
		});

		return turns;
	}

	private createContentHtml(turns: { role: string; content: string }[]): string {
		let content = turns.map((turn, index) => {
			const displayRole = turn.role === 'you' ? 'You' : 'ChatGPT';
			return `
			<div class="chatgpt-turn chatgpt-${turn.role}">
				<div class="chatgpt-role"><h2>${displayRole}</h2></div>
				<div class="chatgpt-content">
					${turn.content}
				</div>
			</div>${index < turns.length - 1 ? '\n<hr>' : ''}`;
		}).join('\n').trim();

		// Add footnotes section if we have any
		if (this.footnotes.length > 0) {
			content += '\n<div class="footnotes">\n<ol>';
			this.footnotes.forEach((footnote, index) => {
				content += `
    <li class="footnote" id="fn:${index + 1}">
      <p>
        <a href="${footnote.url}" target="_blank">${footnote.text}</a>&nbsp;<a href="#fnref:${index + 1}" class="footnote-backref">↩</a>
      </p>
    </li>`;
			});
			content += '\n  </ol>\n</div>';
		}

		return content;
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