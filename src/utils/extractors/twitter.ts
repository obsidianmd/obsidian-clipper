import { BaseExtractor, ExtractorResult } from './_base';

export class TwitterExtractor extends BaseExtractor {
	canExtract(): boolean {
		return true;
	}

	extract(): ExtractorResult {
		// Get the main tweet container
		const tweetContainer = this.document.querySelector('article[data-testid="tweet"]');
		if (!tweetContainer) {
			return { content: '', contentHtml: '' };
		}

		// Get tweet text
		const tweetText = tweetContainer.querySelector('[data-testid="tweetText"]')?.innerHTML || '';
		
		// Get tweet media
		const media = Array.from(tweetContainer.querySelectorAll('img[src*="media"]'))
			.map(img => {
				const imgElement = img as HTMLImageElement;
				return `<img src="${imgElement.src}" alt="${imgElement.alt || ''}" />`;
			});

		const contentHtml = `
			<div class="tweet">
				${tweetText}
				${media.join('\n')}
			</div>
		`;

		return {
				content: contentHtml,
				contentHtml: contentHtml,
				extractedContent: {
					tweetId: this.url.split('/status/')[1]?.split('?')[0] || '',
					tweetAuthor: this.document.querySelector('[data-testid="User-Name"]')?.textContent || '',
				}
			};
	}
} 