export function formatHighlightsToLogseq(inputText: string): string {

	return inputText
		.split('\n')
		.filter(line => line.trim().length > 0)
		.map(line => `* ${line.trim()}`)
		.join('\n');
}
