import { ExtractedContent } from '../../types/types';

export interface ExtractorVariables {
	[key: string]: string;
}

export interface ExtractorResult {
	content: string;
	contentHtml: string;
	extractedContent?: ExtractedContent;
	variables?: ExtractorVariables;
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