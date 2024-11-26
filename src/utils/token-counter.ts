// Simple token count approximation
export function countTokens(text: string): number {
	if (!text) return 0;
	return Math.ceil(text.length / 3);
}

export function updateTokenCount(text: string, displayElement: HTMLElement): void {
	const count = countTokens(text);
	displayElement.textContent = `~${count} tokens`;
	
	// Add warning class if count is getting high
	displayElement.classList.toggle('warning', count > 1500);
	displayElement.classList.toggle('error', count > 2500);
} 