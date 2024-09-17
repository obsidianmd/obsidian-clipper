export interface Template {
	id: string;
	name: string;
	behavior: string;
	noteNameFormat: string;
	path: string;
	noteContentFormat: string;
	properties: Property[];
	triggers?: string[];
	specificNoteName?: string;
	dailyNoteFormat?: string;
	vault?: string;
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

export type FilterFunction = (value: string, param?: string) => string | any[];