import { Defuddle } from 'defuddle';
import { debugLog } from './debug';
import { getLocalStorage, setLocalStorage } from './storage-utils';

// Mobile viewport settings
const VIEWPORT = 'width=device-width, initial-scale=1, maximum-scale=1';

interface ReaderSettings {
	fontSize: number;
	lineHeight: number;
	maxWidth: number;
}

export class Reader {
	private static originalHTML: string | null = null;
	private static isActive: boolean = false;
	private static settingsBar: HTMLElement | null = null;
	private static settings: ReaderSettings = {
		fontSize: 16,
		lineHeight: 1.6,
		maxWidth: 38
	};

	private static async loadSettings(): Promise<void> {
		const savedSettings = await getLocalStorage('reader_settings');
		if (savedSettings) {
			this.settings = {
				...this.settings,
				...savedSettings
			};
		}
	}

	private static async saveSettings(): Promise<void> {
		await setLocalStorage('reader_settings', this.settings);
	}

	private static injectSettingsBar(doc: Document) {
		// Create settings bar
		const settingsBar = doc.createElement('div');
		settingsBar.className = 'obsidian-reader-settings';
		settingsBar.innerHTML = `
			<div class="obsidian-reader-settings-controls">
				<button class="obsidian-reader-settings-button" data-action="decrease-font">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M19 13H5"/>
					</svg>
				</button>
				<button class="obsidian-reader-settings-button" data-action="increase-font">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M12 5v14M5 12h14"/>
					</svg>
				</button>

				<button class="obsidian-reader-settings-button" data-action="decrease-width">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M21 3H3M21 21H3M16 12H8M3 12V3M3 21v-9M21 12V3M21 21v-9"/>
					</svg>
				</button>
				<button class="obsidian-reader-settings-button" data-action="increase-width">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M21 3H3M21 21H3M21 12H3M3 12V3M3 21v-9M21 12V3M21 21v-9"/>
					</svg>
				</button>

				<button class="obsidian-reader-settings-button" data-action="decrease-line-height">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M3 6h18M3 12h18M3 18h18"/>
					</svg>
				</button>
				<button class="obsidian-reader-settings-button" data-action="increase-line-height">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M3 5h18M3 10h18M3 15h18M3 20h18"/>
					</svg>
				</button>
			</div>
		`;

		const style = doc.createElement('style');
		style.textContent = `
			.obsidian-reader-settings {
				position: fixed;
				top: 20px;
				right: 20px;
				background: var(--obsidian-reader-background-primary);
				border: 1px solid var(--obsidian-reader-border);
				border-radius: 24px;
				padding: 4px;
				z-index: 999999999;
				font-family: var(--obsidian-reader-font-family);
				box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
			}
			.obsidian-reader-settings-controls {
				display: grid;
				align-items: center;
				gap: 4px;
			}
			.obsidian-reader-settings-button {
				display: flex;
				align-items: center;
				justify-content: center;
				width: 24px;
				height: 24px;
				border: none;
				background: transparent;
				border-radius: 12px;
				color: var(--obsidian-reader-text-muted);
				cursor: pointer;
				padding: 0;
			}
			.obsidian-reader-settings-button:hover {
				background: var(--obsidian-reader-background-primary-alt);
				color: var(--obsidian-reader-text-primary);
			}
		`;

		doc.head.appendChild(style);
		doc.body.appendChild(settingsBar);
		this.settingsBar = settingsBar;

		// Initialize values from settings
		this.updateFontSize(doc, parseInt(getComputedStyle(doc.documentElement).getPropertyValue('--obsidian-reader-font-size')));
		this.updateWidth(doc, parseInt(getComputedStyle(doc.documentElement).getPropertyValue('--obsidian-reader-line-width')));
		this.updateLineHeight(doc, parseFloat(getComputedStyle(doc.documentElement).getPropertyValue('--obsidian-reader-line-height')));

		settingsBar.addEventListener('click', (e) => {
			const target = e.target as HTMLElement;
			const button = target.closest('.obsidian-reader-settings-button') as HTMLButtonElement;
			if (!button) return;

			const action = button.dataset.action;
			const html = doc.documentElement;
			const style = getComputedStyle(html);

			switch (action) {
				case 'decrease-font':
					this.updateFontSize(doc, parseInt(style.getPropertyValue('--obsidian-reader-font-size')) - 1);
					break;
				case 'increase-font':
					this.updateFontSize(doc, parseInt(style.getPropertyValue('--obsidian-reader-font-size')) + 1);
					break;
				case 'decrease-width':
					this.updateWidth(doc, parseInt(style.getPropertyValue('--obsidian-reader-line-width')) - 2);
					break;
				case 'increase-width':
					this.updateWidth(doc, parseInt(style.getPropertyValue('--obsidian-reader-line-width')) + 2);
					break;
				case 'decrease-line-height':
					this.updateLineHeight(doc, parseFloat(style.getPropertyValue('--obsidian-reader-line-height')) - 0.1);
					break;
				case 'increase-line-height':
					this.updateLineHeight(doc, parseFloat(style.getPropertyValue('--obsidian-reader-line-height')) + 0.1);
					break;
			}
		});
	}

	private static updateFontSize(doc: Document, size: number) {
		size = Math.max(12, Math.min(24, size));
		doc.documentElement.style.setProperty('--obsidian-reader-font-size', `${size}px`);
		this.settings.fontSize = size;
		this.saveSettings();
	}

	private static updateWidth(doc: Document, width: number) {
		width = Math.max(30, Math.min(60, width));
		doc.documentElement.style.setProperty('--obsidian-reader-line-width', `${width}em`);
		this.settings.maxWidth = width;
		this.saveSettings();
	}

	private static updateLineHeight(doc: Document, height: number) {
		height = Math.max(1.2, Math.min(2, Math.round(height * 10) / 10));
		doc.documentElement.style.setProperty('--obsidian-reader-line-height', height.toString());
		this.settings.lineHeight = height;
		this.saveSettings();
	}

	static async apply(doc: Document) {
		// Load saved settings first
		await this.loadSettings();

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
		const defuddled = new Defuddle(document).parse();
		if (!defuddled) {
			debugLog('Reader', 'Failed to parse document');
			return;
		}

		// Format the published date if it exists
		let formattedDate = '';
		if (defuddled.published) {
			try {
				const date = new Date(defuddled.published);
				if (!isNaN(date.getTime())) {
					formattedDate = new Intl.DateTimeFormat(undefined, {
						year: 'numeric',
						month: 'long',
						day: 'numeric',
						timeZone: 'UTC'
					}).format(date);
				} else {
					formattedDate = defuddled.published;
				}
			} catch (e) {
				formattedDate = defuddled.published;
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
			existingViewport.setAttribute('content', VIEWPORT);
		} else {
			const viewport = document.createElement('meta');
			viewport.setAttribute('name', 'viewport');
			viewport.setAttribute('content', VIEWPORT);
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
			${defuddled.title ? `<h1>${defuddled.title}</h1>` : ''}
				<div class="metadata">
					<div class="metadata-details">
						${defuddled.author ? `<span>By ${defuddled.author}</span>` : ''}
						${formattedDate ? `<span> • ${formattedDate}</span>` : ''}
						${defuddled.domain ? `<span> • <a href="${doc.URL}">${defuddled.domain}</a></span>` : ''}
					</div>
				</div>
				${defuddled.content}
			</article>
		`;

		doc.documentElement.className = 'obsidian-reader-active';
		
		// Initialize settings from local storage
		doc.documentElement.style.setProperty('--obsidian-reader-font-size', `${this.settings.fontSize}px`);
		doc.documentElement.style.setProperty('--obsidian-reader-line-height', this.settings.lineHeight.toString());
		doc.documentElement.style.setProperty('--obsidian-reader-line-width', `${this.settings.maxWidth}em`);

		// Add settings bar
		this.injectSettingsBar(doc);
		
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
			this.settingsBar = null;
			this.isActive = false;
		}
	}

	static async toggle(doc: Document): Promise<boolean> {
		if (this.isActive) {
			this.restore(doc);
			return false;
		} else {
			await this.apply(doc);
			return true;
		}
	}
}
