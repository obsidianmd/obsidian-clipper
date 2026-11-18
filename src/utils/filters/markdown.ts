import { createAcademicMarkdownContent } from '../academic';

export const markdown = (str: string, param?: string): string => {
	const baseUrl = param || 'about:blank';
	try {
		return createAcademicMarkdownContent(str, baseUrl);
	} catch (error) {
		console.error('Error in createAcademicMarkdownContent:', error);
		return str;
	}
};