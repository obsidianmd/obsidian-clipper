export interface Template {
	id: string;
	name: string;
	behavior: string;
	noteNameFormat: string;
	path: string;
	noteContentFormat: string;
	properties: Property[];
	urlPatterns: string[];
}

export interface Property {
	name: string;
	value: string;
	type: string;
}