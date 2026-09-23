import Defuddle from 'defuddle/full';
import { setElementHTML } from './dom-utils';

function replaceSvgObjects(doc: Document): void {
	doc.querySelectorAll('object[data]').forEach(object => {
		const type = object.getAttribute('type')?.split(';', 1)[0].trim().toLowerCase();
		if (type !== 'image/svg+xml') return;

		const data = object.getAttribute('data');
		if (!data) return;

		const image = doc.createElement('img');
		image.setAttribute('src', data);
		image.setAttribute('alt', object.getAttribute('aria-label') ?? object.getAttribute('title') ?? '');

		for (const attribute of ['width', 'height', 'class', 'id', 'title']) {
			const value = object.getAttribute(attribute);
			if (value !== null) image.setAttribute(attribute, value);
		}

		object.replaceWith(image);
	});
}

export function prepareDocumentForClip(doc: Document): Document {
	if (!doc.querySelector('object[type^="image/svg+xml" i][data]')) return doc;

	// Defuddle removes <object> elements before extraction, so preserve SVG image
	// objects as normal images without modifying the live page DOM.
	const clipDoc = doc.cloneNode(true) as Document;
	replaceSvgObjects(clipDoc);
	return clipDoc;
}

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
		return new Defuddle(prepareDocumentForClip(readerDoc), { url: '' }).parse();
	}
	return new Defuddle(prepareDocumentForClip(doc), { url: doc.URL }).parse();
}
