import { BaseExtractor, ExtractorResult } from './_base';

export class TwitterExtractor extends BaseExtractor {
	private mainTweet: Element | null;
	private threadTweets: Element[];

	constructor(document: Document, url: string) {
		super(document, url);
		// Get the main tweet and any thread tweets
		this.mainTweet = document.querySelector('article[data-testid="tweet"]');
		this.threadTweets = Array.from(document.querySelectorAll('article[data-testid="tweet"]')).slice(1);
	}

	canExtract(): boolean {
		return !!this.mainTweet;
	}

	extract(): ExtractorResult {
		const mainContent = this.extractTweet(this.mainTweet);
		const threadContent = this.threadTweets.map(tweet => this.extractTweet(tweet)).join('\n\n');
		
		const contentHtml = `
			<div class="tweet-thread">
				<div class="main-tweet">
					${mainContent}
				</div>
				${threadContent ? `
					<div class="thread-tweets">
						${threadContent}
					</div>
				` : ''}
			</div>
		`.trim();

		const tweetId = this.getTweetId();
		const tweetAuthor = this.getTweetAuthor();
		const description = this.createDescription(this.mainTweet);

		return {
			content: contentHtml,
			contentHtml: contentHtml,
			extractedContent: {
				tweetId,
				tweetAuthor,
			},
			variables: {
				title: `Thread by @${tweetAuthor}`,
				author: tweetAuthor,
				site: 'X (Twitter)',
				description,
			}
		};
	}

	private extractTweet(tweet: Element | null): string {
		if (!tweet) return '';

		// Clone the tweet element to modify it
		const tweetClone = tweet.cloneNode(true) as Element;
		
		// Convert emoji images to text
		tweetClone.querySelectorAll('img[src*="/emoji/"]').forEach(img => {
			if (img instanceof HTMLImageElement && img.alt) {
				img.replaceWith(img.alt);
			}
		});

		const tweetText = tweetClone.querySelector('[data-testid="tweetText"]')?.innerHTML || '';
		const images = this.extractImages(tweet);
		const timestamp = tweet.querySelector('time')?.getAttribute('datetime') || '';
		const author = tweet.querySelector('[data-testid="User-Name"]')?.textContent?.trim() || '';
		const date = timestamp ? new Date(timestamp).toISOString().split('T')[0] : '';

		return `
			<div class="tweet">
				<div class="tweet-header">
					<span class="tweet-author">${author}</span>
					${date ? `<span class="tweet-date">${date}</span>` : ''}
				</div>
				${tweetText ? `<div class="tweet-text">${tweetText}</div>` : ''}
				${images.length ? `
					<div class="tweet-media">
						${images.join('\n')}
					</div>
				` : ''}
			</div>
		`.trim();
	}

	private extractImages(tweet: Element): string[] {
		// Look for images in different containers
		const imageContainers = [
			'[data-testid="tweetPhoto"]',
			'[data-testid="tweet-image"]',
			'img[src*="media"]'
		];

		const images: string[] = [];
		
		for (const selector of imageContainers) {
			const elements = tweet.querySelectorAll(selector);
			elements.forEach(img => {
				if (img instanceof HTMLImageElement) {
					// Get the highest quality image by removing size parameters
					const highQualitySrc = img.src.replace(/&name=\w+$/, '&name=large');
					images.push(`<img src="${highQualitySrc}" alt="${img.alt || ''}" />`);
				}
			});
		}

		return images;
	}

	private getTweetId(): string {
		const match = this.url.match(/status\/(\d+)/);
		return match?.[1] || '';
	}

	private getTweetAuthor(): string {
		return this.mainTweet?.querySelector('[data-testid="User-Name"]')?.textContent?.trim() || '';
	}

	private createDescription(tweet: Element | null): string {
		if (!tweet) return '';

		const tweetText = tweet.querySelector('[data-testid="tweetText"]')?.textContent || '';
		return tweetText.trim().slice(0, 140).replace(/\s+/g, ' ');
	}
} 