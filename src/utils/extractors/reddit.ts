import { BaseExtractor, ExtractorResult } from './_base';

export class RedditExtractor extends BaseExtractor {
	canExtract(): boolean {
		return true;
	}

	extract(): ExtractorResult {
		// Get the main post content
		const post = this.extractPost();
		
		// Get comments
		const comments = this.extractComments();

		// Combine post and comments
		const contentHtml = `
<div class="reddit-post">
	${post}
</div>
${comments ? `
<hr>
<h2>Comments</h2>
<div class="reddit-comments">
	${comments}
</div>
			` : ''}
		`;

		return {
			content: contentHtml,
			contentHtml: contentHtml,
			extractedContent: {
				postId: this.getPostId(),
				subreddit: this.getSubreddit(),
				postAuthor: this.getPostAuthor(),
			}
		};
	}

	private extractPost(): string {
		// Get post content - handle text, images, and links
		const postContent = this.document.querySelector('[slot="text-body"]');
		const content = postContent?.innerHTML || '';

		return `<div class="post-content">
	${content}
	</div>`;
	}

	private extractComments(): string {
		const comments = Array.from(this.document.querySelectorAll('shreddit-comment'));
		return this.processComments(comments);
	}

	private processComments(comments: Element[]): string {
		let html = '';
		let currentDepth = -1;
		let blockquoteStack: number[] = []; // Keep track of open blockquotes at each depth

		for (const comment of comments) {
			const depth = parseInt(comment.getAttribute('depth') || '0');
			const author = comment.getAttribute('author') || '';
			const score = comment.getAttribute('score') || '0';
			const permalink = comment.getAttribute('permalink') || '';
			const content = comment.querySelector('[slot="comment"]')?.innerHTML || '';
			
			// Get timestamp from faceplate-timeago element
			const timeElement = comment.querySelector('faceplate-timeago');
			const timestamp = timeElement?.getAttribute('ts') || '';
			const date = timestamp ? new Date(timestamp).toISOString().split('T')[0] : '';
			
			// For top-level comments, close all previous blockquotes and start fresh
			if (depth === 0) {
				// Close all open blockquotes
				while (blockquoteStack.length > 0) {
					html += '</blockquote>';
					blockquoteStack.pop();
				}
				html += '<blockquote>';
				blockquoteStack = [0];
				currentDepth = 0;
			}
			// For nested comments
			else {
				// If we're moving back up the tree
				if (depth < currentDepth) {
					// Close blockquotes until we reach the current depth
					while (blockquoteStack.length > 0 && blockquoteStack[blockquoteStack.length - 1] >= depth) {
						html += '</blockquote>';
						blockquoteStack.pop();
					}
				}
				// If we're going deeper
				else if (depth > currentDepth) {
					html += '<blockquote>';
					blockquoteStack.push(depth);
				}
				// If we're at the same depth, no need to close or open blockquotes
			}

			html += `<div class="comment">
	<div class="comment-metadata">
		<span class="comment-author"><strong>${author}</strong></span> •
		<a href="https://reddit.com${permalink}" class="comment-link">${score} points</a> •
		<span class="comment-date">${date}</span>
	</div>
	<div class="comment-content">${content}</div>
</div>`;

			currentDepth = depth;
		}

		// Close any remaining blockquotes
		while (blockquoteStack.length > 0) {
			html += '</blockquote>';
			blockquoteStack.pop();
		}

		return html;
	}

	private getPostId(): string {
		const match = this.url.match(/comments\/([a-zA-Z0-9]+)/);
		return match ? match[1] : '';
	}

	private getSubreddit(): string {
		const match = this.url.match(/\/r\/([^/]+)/);
		return match ? match[1] : '';
	}

	private getPostAuthor(): string {
		const authorElement = this.document.querySelector('[data-testid="post_author"]');
		return authorElement?.textContent?.replace('u/', '') || '';
	}
} 