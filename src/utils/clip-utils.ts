import Defuddle from 'defuddle/full';
import { setElementHTML } from './dom-utils';
import { AcademicOptions } from '../types/types';
import {
	resolveAcademicOptions,
	prepareDocumentForAcademicClip,
	restoreAcademicHtml,
	extractRawArticleHtml,
	countHtmlWords,
} from './academic';

// Parse document content for clipping. In reader mode, extracts from
// the article's original HTML to avoid reader UI artifacts.
export function parseForClip(doc: Document, academicOptions?: AcademicOptions) {
	let targetDoc = doc;
	let url = doc.URL;
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
		targetDoc = readerDoc;
		url = '';
	}

	const resolvedAcademic = resolveAcademicOptions(academicOptions, { doc: targetDoc, url });
	if (!resolvedAcademic.anyEnabled) {
		return {
			...new Defuddle(targetDoc, { url }).parse(),
			rawContentHtml: extractRawArticleHtml(targetDoc, url),
		};
	}

	const clonedDoc = targetDoc.cloneNode(true) as Document;
	const state = prepareDocumentForAcademicClip(clonedDoc, url, resolvedAcademic);
	const defuddled = new Defuddle(clonedDoc, { url }).parse();
	const content = restoreAcademicHtml(defuddled.content, state);
	return {
		...defuddled,
		content,
		wordCount: countHtmlWords(content),
		rawContentHtml: state.rawContentHtml,
	};
}
