export const kebab = (str: string): string => str
	.replace(/([a-z])([A-Z])/g, '$1-$2')
	.replace(/[\s_]+/g, '-')
	.toLowerCase();