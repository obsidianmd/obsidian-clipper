/**
 * Prompt Builder - System prompt construction for LLM interpretation
 * 
 * Builds dynamic system prompts that explain the hierarchical structure
 * matching the Obsidian template UI:
 * - note_name: The filename of the note
 * - properties: Frontmatter metadata fields
 * - note_content: The body/content of the note
 */

import { ObsidianPropertyType, PromptLocation } from './types';

/**
 * Prompt variable info for prompt generation
 */
export interface PromptInfo {
	key: string;
	prompt: string;
	location: PromptLocation;
	propertyName?: string;
	propertyType?: ObsidianPropertyType;
}

/**
 * Base system prompt for the interpreter.
 */
const SYSTEM_PROMPT_BASE = `You are a helpful assistant that extracts and generates information from web content for Obsidian notes.
Your task is to analyze the provided content and respond to each prompt.
Respond with a single JSON object. Do not include any text before or after the JSON.
Be concise and accurate.`;

/**
 * Map Obsidian property types to JSON schema type descriptions
 */
function getJsonTypeForObsidianType(obsidianType?: ObsidianPropertyType): string {
	switch (obsidianType) {
		case 'number':
			return 'number';
		case 'checkbox':
			return 'boolean';
		case 'date':
			return 'string (ISO date: YYYY-MM-DD)';
		case 'datetime':
			return 'string (ISO datetime: YYYY-MM-DDTHH:mm:ss)';
		case 'multitext':
			return 'array of strings';
		case 'text':
		default:
			return 'string';
	}
}

/**
 * Get a human-readable type hint for the system prompt
 */
function getTypeHint(obsidianType?: ObsidianPropertyType): string {
	switch (obsidianType) {
		case 'number':
			return ' (number)';
		case 'checkbox':
			return ' (true/false)';
		case 'date':
			return ' (date: YYYY-MM-DD)';
		case 'datetime':
			return ' (datetime: YYYY-MM-DDTHH:mm:ss)';
		case 'multitext':
			return ' (array of strings)';
		case 'text':
		default:
			return '';
	}
}

/**
 * Build a dynamic system prompt that explains the hierarchical structure
 * matching the Obsidian template UI:
 * - note_name: The filename of the note
 * - properties: Frontmatter metadata fields
 * - note_content: The body/content of the note
 */
export function buildSystemPrompt(prompts: PromptInfo[]): string {
	// Group prompts by location
	const noteNamePrompts = prompts.filter((p) => p.location === 'note_name');
	const propertiesPrompts = prompts.filter((p) => p.location === 'properties');
	const noteContentPrompts = prompts.filter((p) => p.location === 'note_content');

	// Build section descriptions
	const sections: string[] = [];

	if (noteNamePrompts.length > 0) {
		const fields = noteNamePrompts
			.map((p) => `  - **${p.key}**: ${p.prompt}`)
			.join('\n');
		sections.push(`### note_name
The filename for the Obsidian note. Should be concise and descriptive.
${fields}`);
	}

	if (propertiesPrompts.length > 0) {
		const fields = propertiesPrompts
			.map((p) => {
				const typeHint = getTypeHint(p.propertyType);
				return `  - **${p.key}**${typeHint}: ${p.prompt}`;
			})
			.join('\n');
		sections.push(`### properties
Frontmatter metadata fields that appear at the top of the note.
${fields}`);
	}

	if (noteContentPrompts.length > 0) {
		const fields = noteContentPrompts
			.map((p) => `  - **${p.key}**: ${p.prompt}`)
			.join('\n');
		sections.push(`### note_content
The main body/content of the note. Can include Markdown formatting and Obsidian specific features.
${fields}`);
	}

	// Build JSON schema example
	const schemaObj: Record<string, Record<string, string>> = {};

	if (noteNamePrompts.length > 0) {
		schemaObj['note_name'] = {};
		for (const p of noteNamePrompts) {
			schemaObj['note_name'][p.key] = 'string';
		}
	}

	if (propertiesPrompts.length > 0) {
		schemaObj['properties'] = {};
		for (const p of propertiesPrompts) {
			schemaObj['properties'][p.key] = getJsonTypeForObsidianType(p.propertyType);
		}
	}

	if (noteContentPrompts.length > 0) {
		schemaObj['note_content'] = {};
		for (const p of noteContentPrompts) {
			schemaObj['note_content'][p.key] = 'string';
		}
	}

	const schemaJson = JSON.stringify(schemaObj, null, 2);

	return `${SYSTEM_PROMPT_BASE}

## Response Structure
Your response should be organized into sections matching the Obsidian note structure:

${sections.join('\n\n')}

## JSON Schema
\`\`\`json
${schemaJson}
\`\`\``;
}

/**
 * Build prompt content showing which prompts need responses, organized by location.
 * This helps the LLM understand the structure we expect.
 */
export function buildPromptContent(promptVariables: Array<{
	key: string;
	prompt: string;
	location: PromptLocation;
}>): {
	note_name?: Record<string, string>;
	properties?: Record<string, string>;
	note_content?: Record<string, string>;
} {
	const promptContent: {
		note_name?: Record<string, string>;
		properties?: Record<string, string>;
		note_content?: Record<string, string>;
	} = {};

	const noteNamePrompts = promptVariables.filter((v) => v.location === 'note_name');
	const propertiesPrompts = promptVariables.filter((v) => v.location === 'properties');
	const noteContentPrompts = promptVariables.filter((v) => v.location === 'note_content');

	if (noteNamePrompts.length > 0) {
		promptContent.note_name = Object.fromEntries(
			noteNamePrompts.map((v) => [v.key, v.prompt])
		);
	}
	if (propertiesPrompts.length > 0) {
		promptContent.properties = Object.fromEntries(
			propertiesPrompts.map((v) => [v.key, v.prompt])
		);
	}
	if (noteContentPrompts.length > 0) {
		promptContent.note_content = Object.fromEntries(
			noteContentPrompts.map((v) => [v.key, v.prompt])
		);
	}

	return promptContent;
}
