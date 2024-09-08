import { Template } from '../types/types';

export function findMatchingTemplate(url: string, templates: Template[]): Template | undefined {
	return templates.find(template => 
		template.urlPatterns && template.urlPatterns.some(pattern => {
			if (pattern.startsWith('/') && pattern.endsWith('/')) {
				try {
					const regexPattern = new RegExp(pattern.slice(1, -1));
					return regexPattern.test(url);
				} catch (error) {
					console.error(`Invalid regex pattern: ${pattern}`, error);
					return false;
				}
			} else {
				return url.startsWith(pattern);
			}
		})
	);
}
