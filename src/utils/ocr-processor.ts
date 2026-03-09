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

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 120000);

	let response: Response;
	try {
		response = await fetch('https://api.mistral.ai/v1/ocr', {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(requestBody),
			signal: controller.signal
		});
	} catch (error) {
		clearTimeout(timeoutId);
		if (error instanceof DOMException && error.name === 'AbortError') {
			throw new Error('OCR request timed out. The PDF may be too large.');
		}
		throw error;
	}
	clearTimeout(timeoutId);

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Mistral OCR API error (${response.status}): ${errorText}`);
	}

	const data: OcrResponse = await response.json();

	if (!data.pages || !Array.isArray(data.pages)) {
		throw new Error('Unexpected response from Mistral OCR API');
	}

	const pagesProcessed = data.usage_info?.pages_processed ?? data.pages.length;
	debugLog('OCR', `Processed ${pagesProcessed} pages`);

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
			const dataUri = toDataUri(base64Data);
			markdown = markdown.replace(
				imagePattern,
				(_, alt) => `![${alt}](${dataUri})`
			);
		}
	}

	const title = extractTitleFromUrl(url);

	return {
		markdown,
		title,
		pageCount: pagesProcessed
	};
}

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toDataUri(base64Data: string): string {
	// If already a data URI, return as-is
	if (base64Data.startsWith('data:')) {
		return base64Data;
	}
	// Detect MIME type from base64 magic bytes
	const mimeType = detectImageMimeType(base64Data);
	return `data:${mimeType};base64,${base64Data}`;
}

function detectImageMimeType(base64Data: string): string {
	const header = base64Data.substring(0, 16);
	if (header.startsWith('/9j/')) return 'image/jpeg';
	if (header.startsWith('iVBOR')) return 'image/png';
	if (header.startsWith('R0lGO')) return 'image/gif';
	if (header.startsWith('UklGR')) return 'image/webp';
	return 'image/png'; // fallback
}
