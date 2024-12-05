import { ExtractedContent } from '../../types/types';

export interface ExtractorResult {
	content: string;
	contentHtml: string;
	extractedContent?: ExtractedContent;
}

export abstract class BaseExtractor {
	protected document: Document;
	protected url: string;

	constructor(document: Document, url: string) {
		this.document = document;
		this.url = url;
	}

	abstract canExtract(): boolean;
	abstract extract(): ExtractorResult;
} 