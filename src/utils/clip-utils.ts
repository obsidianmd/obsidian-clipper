import Defuddle from 'defuddle/full';

// Parse document content for clipping. In reader mode, extracts from
// the article's original HTML to avoid reader UI artifacts.
export function parseForClip(doc: Document) {
	const readerArticle = doc.querySelector('.obsidian-reader-active .obsidian-reader-content article');
	if (readerArticle) {
		const readerDoc = doc.implementation.createHTMLDocument();
		const originalHtml = readerArticle.getAttribute('data-original-html');
		readerDoc.body.innerHTML = originalHtml || readerArticle.innerHTML;
		return new Defuddle(readerDoc, { url: '' }).parse();
	}
	return new Defuddle(doc, { url: doc.URL }).parse();
}
