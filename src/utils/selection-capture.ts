export interface SelectionSnapshot {
	html: string;
	text: string;
}

function createPlainTextFallback(text: string, document: Document): string {
	const container = document.createElement('div');
	const paragraphs = text
		.split(/\n{2,}/)
		.map(paragraph => paragraph.replace(/\n+/g, ' ').trim())
		.filter(Boolean);

	for (const paragraph of paragraphs) {
		const element = document.createElement('p');
		element.textContent = paragraph;
		container.appendChild(element);
	}

	return container.innerHTML;
}

export function captureSelectionSnapshot(selection: Selection | null, document: Document): SelectionSnapshot | null {
	if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

	const text = selection.toString().trim();
	if (!text) return null;

	const container = document.createElement('div');
	try {
		for (let index = 0; index < selection.rangeCount; index++) {
			if (index > 0) container.appendChild(document.createElement('br'));
			container.appendChild(selection.getRangeAt(index).cloneContents());
		}
	} catch {
		return { html: createPlainTextFallback(text, document), text };
	}

	const html = container.innerHTML.trim();
	return { html: html || createPlainTextFallback(text, document), text };
}
