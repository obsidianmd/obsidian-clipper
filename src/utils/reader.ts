import { Tidy } from './tidy';
import { debugLog } from './debug';

// Mobile viewport settings
const MOBILE_VIEWPORT = 'width=device-width, initial-scale=1, maximum-scale=1';

export class Reader {
	private static originalHTML: string | null = null;
	private static isActive: boolean = false;

	static apply(doc: Document) {
		// Store original HTML for restoration
		this.originalHTML = doc.documentElement.outerHTML;
		
		// Clean the html element but preserve lang and dir attributes
		const htmlElement = doc.documentElement;
		const lang = htmlElement.getAttribute('lang');
		const dir = htmlElement.getAttribute('dir');
		
		Array.from(htmlElement.attributes).forEach(attr => {
			htmlElement.removeAttribute(attr.name);
		});
		
		// Restore lang and dir if they existed
		if (lang) htmlElement.setAttribute('lang', lang);
		if (dir) htmlElement.setAttribute('dir', dir);
		
		// Parse the document
		const parsed = Tidy.parse(doc);
		if (!parsed) {
			debugLog('Reader', 'Failed to parse document');
			return;
		}

		// Format the published date if it exists
		let formattedDate = '';
		if (parsed.published) {
			try {
				const date = new Date(parsed.published);
				if (!isNaN(date.getTime())) {
					formattedDate = new Intl.DateTimeFormat(undefined, {
						year: 'numeric',
						month: 'long',
						day: 'numeric',
						timeZone: 'UTC'
					}).format(date);
				} else {
					formattedDate = parsed.published;
				}
			} catch (e) {
				formattedDate = parsed.published;
				debugLog('Reader', 'Error formatting date:', e);
			}
		}

		// Clean up head - remove unwanted elements but keep meta tags and non-stylesheet links
		const head = doc.head;

		// Remove scripts except JSON-LD schema
		const scripts = head.querySelectorAll('script:not([type="application/ld+json"])');
		scripts.forEach(el => el.remove());

		// Remove base tags
		const baseTags = head.querySelectorAll('base');
		baseTags.forEach(el => el.remove());

		// Remove only stylesheet links and style tags
		const styleElements = head.querySelectorAll('link[rel="stylesheet"], link[as="style"], style');
		styleElements.forEach(el => el.remove());

		// Ensure we have our required meta tags
		const existingViewport = head.querySelector('meta[name="viewport"]');
		if (existingViewport) {
			existingViewport.setAttribute('content', MOBILE_VIEWPORT);
		} else {
			const viewport = document.createElement('meta');
			viewport.setAttribute('name', 'viewport');
			viewport.setAttribute('content', MOBILE_VIEWPORT);
			head.appendChild(viewport);
		}

		const existingCharset = head.querySelector('meta[charset]');
		if (existingCharset) {
			existingCharset.setAttribute('charset', 'UTF-8');
		} else {
			const charset = document.createElement('meta');
			charset.setAttribute('charset', 'UTF-8');
			head.insertBefore(charset, head.firstChild);
		}

		// Replace body content with reader view
		doc.body.innerHTML = `
			<article>
			${parsed.title ? `<h1>${parsed.title}</h1>` : ''}
				<div class="metadata">
					<div class="metadata-details">
						${parsed.author ? `<span>By ${parsed.author}</span>` : ''}
						${formattedDate ? `<span> • ${formattedDate}</span>` : ''}
						${parsed.domain ? `<span> • <a href="${doc.URL}">${parsed.domain}</a></span>` : ''}
					</div>
				</div>
				${parsed.content}
			</article>
		`;

		doc.body.className = 'obsidian-reader-active';
		
		this.isActive = true;
	}

	static restore(doc: Document) {
		if (this.originalHTML) {			
			const parser = new DOMParser();
			const newDoc = parser.parseFromString(this.originalHTML, 'text/html');
			doc.replaceChild(
				newDoc.documentElement,
				doc.documentElement
			);
			
			this.originalHTML = null;
			this.isActive = false;
		}
	}

	static toggle(doc: Document): boolean {
		if (this.isActive) {
			this.restore(doc);
			return false;
		} else {
			this.apply(doc);
			return true;
		}
	}
}
