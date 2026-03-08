import { debugLog } from './debug';

export interface OcrResult {
	markdown: string;
	title: string;
	pageCount: number;
}

interface OcrPageImage {
	id: string;
	image_base64?: string;
}

interface OcrPage {
	index: number;
	markdown: string;
	images: OcrPageImage[];
}

interface OcrResponse {
	pages: OcrPage[];
	model: string;
	usage_info: {
		pages_processed: number;
		doc_size_bytes: number | null;
	};
}

export function isPdfUrl(url: string): boolean {
	try {
		const urlObj = new URL(url);
		const pathname = urlObj.pathname.toLowerCase();
		return pathname.endsWith('.pdf');
	} catch {
		return false;
	}
}

function extractTitleFromUrl(url: string): string {
	try {
		const urlObj = new URL(url);
		const pathname = urlObj.pathname;
		const filename = pathname.split('/').pop() || '';
		// Remove .pdf extension and decode URI component
		const name = decodeURIComponent(filename.replace(/\.pdf$/i, ''));
		// Replace underscores and hyphens with spaces
		return name.replace(/[_-]/g, ' ') || 'PDF Document';
	} catch {
		return 'PDF Document';
	}
}

export async function processPdfWithOcr(
	url: string,
	apiKey: string,
	includeImages: boolean
): Promise<OcrResult> {
	debugLog('OCR', 'Processing PDF:', url);

	const requestBody = {
		model: 'mistral-ocr-latest',
		document: {
			type: 'document_url',
			document_url: url
		},
		include_image_base64: includeImages,
		table_format: 'html'
	};

	const response = await fetch('https://api.mistral.ai/v1/ocr', {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${apiKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(requestBody)
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Mistral OCR API error (${response.status}): ${errorText}`);
	}

	const data: OcrResponse = await response.json();
	debugLog('OCR', `Processed ${data.usage_info.pages_processed} pages`);

	// Build image lookup from all pages
	const imageMap = new Map<string, string>();
	if (includeImages) {
		for (const page of data.pages) {
			for (const img of page.images) {
				if (img.image_base64) {
					imageMap.set(img.id, img.image_base64);
				}
			}
		}
	}

	// Concatenate all page markdown with page separators
	let markdown = data.pages
		.map(page => page.markdown)
		.join('\n\n---\n\n');

	// Replace image references with base64 data URIs
	if (includeImages && imageMap.size > 0) {
		for (const [imageId, base64Data] of imageMap) {
			// Mistral OCR uses ![image_id](image_id) format in markdown
			const imagePattern = new RegExp(
				`!\\[([^\\]]*)\\]\\(${escapeRegex(imageId)}\\)`,
				'g'
			);
			markdown = markdown.replace(
				imagePattern,
				(_, alt) => `![${alt}](data:image/png;base64,${base64Data})`
			);
		}
	}

	const title = extractTitleFromUrl(url);

	return {
		markdown,
		title,
		pageCount: data.usage_info.pages_processed
	};
}

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
