import { createMarkdownContent } from 'defuddle/full';
import { convertMediaEmbeds } from '../content-extractor';

export const markdown = (str: string, param?: string): string => {
	const baseUrl = param || 'about:blank';
	try {
		return createMarkdownContent(convertMediaEmbeds(str), baseUrl);
	} catch (error) {
		console.error('Error in createMarkdownContent:', error);
		return str;
	}
};