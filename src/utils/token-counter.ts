import { formatCost } from './string-utils';

/**
 * Approximate token count estimation for LLMs.
 * 
 * This is a rough estimation used for pre-request validation and cost estimates.
 * Actual token counts vary by model and tokenizer. Common approximations:
 * 
 *   - 1 token ≈ 4 characters (English text)
 *   - 1 token ≈ ¾ of a word
 *   - 100 tokens ≈ 75 words
 *   - 1-2 sentences ≈ 30 tokens
 *   - 1 paragraph ≈ 100 tokens
 *   - ~1,500 words ≈ 2,048 tokens
 * 
 * Note: Code, non-English text, and special characters may tokenize differently.
 * The AI SDK returns actual token usage in the response for accurate tracking.
 */
export function countTokens(text: string): number {
	if (!text) return 0;
	// 1 token ≈ 4 characters is a widely-used approximation for English text
	return Math.ceil(text.length / 4);
}

/**
 * Calculate estimated cost for input tokens only
 * Cost is per million tokens from models.dev
 */
function calculateInputCost(tokenCount: number, inputCostPerMillion: number): number {
	return (tokenCount / 1_000_000) * inputCostPerMillion;
}

/**
 * Update token count display with basic thresholds
 */
export function updateTokenCount(text: string, displayElement: HTMLElement): void {
	const count = countTokens(text);
	displayElement.textContent = `~${count.toLocaleString()} tokens`;
	
	// Add warning class if count is getting high (basic thresholds)
	displayElement.classList.toggle('warning', count > 50000);
	displayElement.classList.toggle('error', count > 100000);
	displayElement.classList.remove('usage-complete');
}

/**
 * Update token count display with model-specific context limit and optional cost estimate
 * 
 * @param text - The text to count tokens for
 * @param displayElement - The HTML element to update
 * @param contextLimit - Optional model context window limit
 * @param inputCost - Optional input cost per million tokens from models.dev
 */
export function updateTokenCountWithLimit(
	text: string,
	displayElement: HTMLElement,
	contextLimit: number | undefined,
	inputCost?: number
): void {
	const count = countTokens(text);
	
	// Build display parts
	const parts: string[] = [];
	
	// Token count with optional limit
	if (contextLimit) {
		const percentUsed = (count / contextLimit) * 100;
		parts.push(`~${count.toLocaleString()} / ${contextLimit.toLocaleString()} tokens (${percentUsed.toFixed(0)}%)`);
		
		// Warning at 70%, error at 90%
		displayElement.classList.toggle('warning', percentUsed > 70 && percentUsed <= 90);
		displayElement.classList.toggle('error', percentUsed > 90);
	} else {
		parts.push(`~${count.toLocaleString()} tokens`);
		// Fall back to basic thresholds if no limit known
		displayElement.classList.toggle('warning', count > 50000);
		displayElement.classList.toggle('error', count > 100000);
	}
	
	// Add estimated cost if available
	if (inputCost !== undefined && inputCost > 0) {
		const estimatedCost = calculateInputCost(count, inputCost);
		parts.push(formatCost(estimatedCost, true));
	}
	
	displayElement.textContent = parts.join(' ');
	displayElement.classList.remove('usage-complete');
}