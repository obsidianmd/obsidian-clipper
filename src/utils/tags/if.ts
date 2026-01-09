import { evaluateCondition } from '../expression-evaluator';
import { processVariables } from '../template-compiler';

interface IfBlock {
	condition: string;
	content: string;
}

interface ParsedIf {
	ifBlock: IfBlock;
	elseifBlocks: IfBlock[];
	elseContent: string | null;
	fullLength: number;  // Total length consumed from the original text
}

// Process {% if %} blocks
// This is called by the template compiler when it finds an opening {% if %} tag
export async function processIfBlock(
	text: string,
	startMatch: RegExpExecArray,
	variables: { [key: string]: any },
	currentUrl: string,
	processLogic: (text: string, variables: { [key: string]: any }, currentUrl: string) => Promise<string>
): Promise<{ result: string; length: number }> {
	const condition = startMatch[1];
	const openTagLength = startMatch[0].length;
	const startIndex = startMatch.index + openTagLength;

	try {
		// Parse the if/elseif/else/endif structure
		const parsed = parseIfStructure(text, startIndex);
		if (!parsed) {
			console.error('Unmatched {% if %} tag at:', startMatch[0]);
			return { result: startMatch[0], length: openTagLength };
		}

		// Evaluate conditions and select content
		const context = { variables };
		let selectedContent: string | null = null;

		// Check main if condition
		if (evaluateCondition(condition, context)) {
			selectedContent = parsed.ifBlock.content;
		} else {
			// Check elseif conditions
			for (const elseif of parsed.elseifBlocks) {
				if (evaluateCondition(elseif.condition, context)) {
					selectedContent = elseif.content;
					break;
				}
			}

			// Fall back to else if no condition matched
			if (selectedContent === null) {
				selectedContent = parsed.elseContent || '';
			}
		}

		// Recursively process nested logic in selected content
		let processedContent = await processLogic(selectedContent, variables, currentUrl);
		// Process variables
		processedContent = await processVariables(0, processedContent, variables, currentUrl);

		return {
			result: processedContent,
			length: openTagLength + parsed.fullLength
		};
	} catch (error) {
		console.error('Error processing {% if %} block:', error, 'Condition:', condition);
		return { result: startMatch[0], length: openTagLength };
	}
}

// Parse the if/elseif/else/endif structure with proper nesting support
function parseIfStructure(text: string, startIndex: number): ParsedIf | null {
	let depth = 1;
	let currentIndex = startIndex;
	let currentContent = '';

	const ifBlock: IfBlock = { condition: '', content: '' };
	const elseifBlocks: IfBlock[] = [];
	let elseContent: string | null = null;

	// Track what section we're in
	type Section = 'if' | 'elseif' | 'else';
	let currentSection: Section = 'if';
	let currentElseifCondition = '';

	// Regex patterns for tags - use [^%]* to avoid matching across %} boundaries
	const tagPattern = /{%\s*(if|elseif|else|endif)(?:\s+([^%]*?))?\s*%}/g;

	while (depth > 0 && currentIndex < text.length) {
		tagPattern.lastIndex = currentIndex;
		const match = tagPattern.exec(text);

		if (!match) {
			// No more tags found, unbalanced
			return null;
		}

		// Add content before this tag
		currentContent += text.slice(currentIndex, match.index);

		const tagType = match[1];
		const tagCondition = match[2] || '';

		if (tagType === 'if') {
			// Nested if - increase depth, include tag in content
			depth++;
			currentContent += match[0];
		} else if (tagType === 'endif') {
			depth--;
			if (depth === 0) {
				// This is our matching endif - save current section
				saveSection(currentSection, currentContent, ifBlock, elseifBlocks, currentElseifCondition, (content) => {
					elseContent = content;
				});
				// Calculate total length consumed
				const fullLength = match.index + match[0].length - startIndex;
				return { ifBlock, elseifBlocks, elseContent, fullLength };
			} else {
				// Nested endif - include in content
				currentContent += match[0];
			}
		} else if (depth === 1) {
			// elseif or else at our level
			if (tagType === 'elseif') {
				// Save current section and start new elseif
				saveSection(currentSection, currentContent, ifBlock, elseifBlocks, currentElseifCondition, (content) => {
					elseContent = content;
				});
				currentSection = 'elseif';
				currentElseifCondition = tagCondition;
				currentContent = '';
			} else if (tagType === 'else') {
				// Save current section and start else
				saveSection(currentSection, currentContent, ifBlock, elseifBlocks, currentElseifCondition, (content) => {
					elseContent = content;
				});
				currentSection = 'else';
				currentContent = '';
			}
		} else {
			// Nested elseif/else - include in content
			currentContent += match[0];
		}

		currentIndex = match.index + match[0].length;
	}

	// If we get here, we never found matching endif
	return null;
}

// Helper to save content to the appropriate section
function saveSection(
	section: 'if' | 'elseif' | 'else',
	content: string,
	ifBlock: IfBlock,
	elseifBlocks: IfBlock[],
	elseifCondition: string,
	setElseContent: (content: string) => void
): void {
	const trimmedContent = content;

	switch (section) {
		case 'if':
			ifBlock.content = trimmedContent;
			break;
		case 'elseif':
			elseifBlocks.push({ condition: elseifCondition, content: trimmedContent });
			break;
		case 'else':
			setElseContent(trimmedContent);
			break;
	}
}
