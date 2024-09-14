import { escapeMarkdown } from '../string-utils';

export const image = (str: string, altText?: string): string => {
	if (!str.trim()) {
		return str;
	}
	try {
		const data = JSON.parse(str);
		
		const processObject = (obj: any): string[] => {
			return Object.entries(obj).map(([key, value]) => {
				if (typeof value === 'object' && value !== null) {
					return processObject(value);
				}
				return `![${escapeMarkdown(String(value))}](${escapeMarkdown(key)})`;
			}).flat();
		};

		if (Array.isArray(data)) {
			const result = data.flatMap(item => {
				if (typeof item === 'object' && item !== null) {
					return processObject(item);
				}
				return item ? `![${altText || ''}](${escapeMarkdown(String(item))})` : '';
			});
			return JSON.stringify(result);
		} else if (typeof data === 'object' && data !== null) {
			return JSON.stringify(processObject(data));
		}
	} catch (error) {
		// If parsing fails, treat it as a single string
		return `![${altText || ''}](${escapeMarkdown(str)})`;
	}
	return str;
};