export const unescape = (str: string): string => str
	.replace(/\\"/g, '"')
	.replace(/\\n/g, '\n');