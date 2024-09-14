import { createMarkdownContent } from '../markdown-converter';

export const markdown = (str: string, url?: string): string => {
	const baseUrl = url || 'about:blank';
	try {
		return createMarkdownContent(str, baseUrl);
	} catch (error) {
		console.error('Error in createMarkdownContent:', error);
		return str;
	}
};