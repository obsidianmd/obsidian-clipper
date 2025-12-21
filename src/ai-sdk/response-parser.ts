/**
 * Response Parser - JSON parsing and response mapping for LLM output
 * 
 * Handles parsing of LLM responses, including:
 * - JSON extraction from markdown code blocks
 * - Curly quote normalization
 * - Response structure validation
 * - Value lookup from hierarchical responses
 */

import { debugLog } from '../utils/debug';
import { PromptLocation } from './types';

/**
 * Response type for a single prompt value
 */
export type PromptResponseValue = string | number | boolean | string[];

/**
 * Expected response structure for manual JSON parsing
 * Hierarchical structure matching the Obsidian template UI
 */
export interface ParsedResponse {
	note_name?: Record<string, PromptResponseValue>;
	properties?: Record<string, PromptResponseValue>;
	note_content?: Record<string, PromptResponseValue>;
}

/**
 * Parse JSON from raw text response (fallback for models without structured output)
 *
 * This handles common issues with LLM JSON output:
 * - Extracts JSON from markdown code blocks
 * - Handles curly quotes
 * - Cleans up common formatting issues
 */
export function parseJsonFromText(text: string): ParsedResponse {
	let jsonStr = text.trim();

	// Try to extract JSON from markdown code blocks
	const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
	if (codeBlockMatch) {
		jsonStr = codeBlockMatch[1].trim();
	}

	// If the text starts with explanatory content, try to find the JSON object
	if (!jsonStr.startsWith('{')) {
		const jsonStart = jsonStr.indexOf('{');
		if (jsonStart !== -1) {
			// Find the matching closing brace
			let depth = 0;
			let jsonEnd = jsonStart;
			for (let i = jsonStart; i < jsonStr.length; i++) {
				if (jsonStr[i] === '{') depth++;
				if (jsonStr[i] === '}') depth--;
				if (depth === 0) {
					jsonEnd = i + 1;
					break;
				}
			}
			jsonStr = jsonStr.substring(jsonStart, jsonEnd);
		}
	}

	// Replace curly quotes with straight quotes
	jsonStr = jsonStr
		.replace(/[\u201C\u201D]/g, '"') // Replace curly double quotes
		.replace(/[\u2018\u2019]/g, "'"); // Replace curly single quotes

	try {
		const parsed = JSON.parse(jsonStr);

		// Validate structure - expect hierarchical format with note_name/properties/note_content
		if (typeof parsed === 'object' && parsed !== null) {
			const hasExpectedStructure =
				'note_name' in parsed ||
				'properties' in parsed ||
				'note_content' in parsed;

			if (hasExpectedStructure) {
				return parsed as ParsedResponse;
			}

			// If model returned flat structure, try to use it directly
			// This provides backwards compatibility
			return parsed as ParsedResponse;
		}

		throw new Error(
			'Invalid response structure: expected object with note_name, properties, or note_content'
		);
	} catch (parseError) {
		debugLog('ResponseParser', 'JSON parse failed', {
			error: parseError instanceof Error ? parseError.message : String(parseError),
			text: jsonStr.substring(0, 200) + '...',
		});
		throw new Error(
			`Failed to parse JSON response from model. ` +
				`The model may not reliably generate structured output. ` +
				`Consider using a model with tool calling support.`
		);
	}
}

/**
 * Look up a response value from the hierarchical ParsedResponse structure
 */
export function getResponseValue(
	response: ParsedResponse,
	location: PromptLocation,
	key: string
): PromptResponseValue {
	switch (location) {
		case 'note_name':
			return response.note_name?.[key] ?? '';
		case 'properties':
			return response.properties?.[key] ?? '';
		case 'note_content':
			return response.note_content?.[key] ?? '';
		default:
			return '';
	}
}

/**
 * Get the keys present in a ParsedResponse for debug logging
 */
export function getResponseKeys(response: ParsedResponse): string[] {
	const keys: string[] = [];
	if (response.note_name) {
		keys.push(...Object.keys(response.note_name).map((k) => `note_name.${k}`));
	}
	if (response.properties) {
		keys.push(...Object.keys(response.properties).map((k) => `properties.${k}`));
	}
	if (response.note_content) {
		keys.push(...Object.keys(response.note_content).map((k) => `note_content.${k}`));
	}
	return keys;
}
