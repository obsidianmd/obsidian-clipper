export const blockquote = (str: string): string => {
	return str.split('\n').map(line => `> ${line}`).join('\n');
};