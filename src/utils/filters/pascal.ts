export const pascal = (str: string) => str
	.replace(/[\s_-]+(.)/g, (_, c) => c.toUpperCase())
	.replace(/^(.)/, c => c.toUpperCase());