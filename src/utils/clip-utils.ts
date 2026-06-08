import Defuddle from 'defuddle/full';
import { setElementHTML } from './dom-utils';
import { cleanDocumentInPlace } from './ad-cleaner';

// Parse document content for clipping. In reader mode, extracts from
// the article's original HTML to avoid reader UI artifacts.
export function parseForClip(doc: Document) {
	const readerArticle = doc.querySelector('.obsidian-reader-active .obsidian-reader-content article');
	if (readerArticle) {
		const readerDoc = doc.implementation.createHTMLDocument();
		const originalHtml = readerArticle.getAttribute('data-original-html');
		if (originalHtml) {
			setElementHTML(readerDoc.body, originalHtml);
		} else {
			readerDoc.body.replaceChildren(
				...Array.from(readerArticle.childNodes).map(n => readerDoc.importNode(n, true))
			);
		}
		cleanDocumentInPlace(readerDoc, { url: doc.URL });
		return new Defuddle(readerDoc, { url: '' }).parse();
	}

	const parser = new DOMParser();
	const cleanDoc = parser.parseFromString(doc.documentElement.outerHTML, 'text/html');
	cleanDocumentInPlace(cleanDoc, { url: doc.URL });
	return new Defuddle(cleanDoc, { url: doc.URL }).parse();
}
