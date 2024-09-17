import { createMarkdownContent } from '../markdown-converter';

export const markdown = (str: string, param?: string): string => {
	const [baseUrl = '/'] = param ? param.split(',') : [];
	try {
		return createMarkdownContent(str, baseUrl);
	} catch (error) {
		console.error('Error in createMarkdownContent:', error);
		return str;
	}
};