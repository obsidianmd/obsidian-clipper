export interface Template {
	id: string;
	name: string;
	behavior: string;
	noteNameFormat: string;
	path: string;
	noteContentFormat: string;
	properties: Property[];
	urlPatterns?: string[];
	specificNoteName?: string;
	dailyNoteFormat?: string;
}

export interface Property {
	id: string;
	name: string;
	value: string;
	type: string;
}

export interface ExtractedContent {
	[key: string]: string;
}