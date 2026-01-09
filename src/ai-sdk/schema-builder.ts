/**
 * Schema Builder - Zod schema generation for structured LLM output
 * 
 * Builds dynamic Zod schemas that match the Obsidian template structure:
 * - note_name: Fields for the note filename
 * - properties: Fields for frontmatter properties  
 * - note_content: Fields for the note body
 */

import { ObsidianPropertyType, PromptLocation } from './types';

/**
 * Prompt variable info for schema generation
 */
export interface PromptInfo {
	key: string;
	prompt: string;
	location: PromptLocation;
	propertyName?: string;
	propertyType?: ObsidianPropertyType;
}

// Cache for dynamically loaded Zod module
let zodModule: typeof import('zod') | null = null;

/**
 * Ensure Zod module is loaded
 * 
 * Note: JIT mode is disabled via the ./zod-config import at the top of this file.
 * This prevents CSP violations from Zod's `new Function()` usage in browser extensions.
 */
async function ensureZodLoaded() {
	if (!zodModule) {
		zodModule = await import(
			/* webpackChunkName: "zod" */
			'zod'
		);
	}
	return zodModule;
}

/**
 * Create a Zod schema field for a single prompt based on its Obsidian type
 */
function createZodField(z: typeof import('zod'), prompt: PromptInfo) {
	const description = prompt.prompt;

	switch (prompt.propertyType) {
		case 'number':
			return z.z.number().describe(description);
		case 'checkbox':
			return z.z.boolean().describe(description);
		case 'date':
			return z.z.string().describe(`${description} (format: YYYY-MM-DD)`);
		case 'datetime':
			return z.z.string().describe(`${description} (format: YYYY-MM-DDTHH:mm:ss)`);
		case 'multitext':
			return z.z.array(z.z.string()).describe(description);
		case 'text':
		default:
			return z.z.string().describe(description);
	}
}

/**
 * Build a dynamic Zod schema that mirrors the Obsidian template structure:
 * - note_name: Fields for the note filename
 * - properties: Fields for frontmatter properties
 * - note_content: Fields for the note body
 */
export async function buildDynamicSchema(prompts: PromptInfo[]) {
	const z = await ensureZodLoaded();

	// Group prompts by location
	const noteNamePrompts = prompts.filter((p) => p.location === 'note_name');
	const propertiesPrompts = prompts.filter((p) => p.location === 'properties');
	const noteContentPrompts = prompts.filter((p) => p.location === 'note_content');

	// Build schema for each section
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const rootShape: Record<string, any> = {};

	if (noteNamePrompts.length > 0) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const noteNameShape: Record<string, any> = {};
		for (const prompt of noteNamePrompts) {
			noteNameShape[prompt.key] = createZodField(z, prompt);
		}
		rootShape['note_name'] = z.z.object(
			noteNameShape as Parameters<typeof z.z.object>[0]
		);
	}

	if (propertiesPrompts.length > 0) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const propertiesShape: Record<string, any> = {};
		for (const prompt of propertiesPrompts) {
			propertiesShape[prompt.key] = createZodField(z, prompt);
		}
		rootShape['properties'] = z.z.object(
			propertiesShape as Parameters<typeof z.z.object>[0]
		);
	}

	if (noteContentPrompts.length > 0) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const noteContentShape: Record<string, any> = {};
		for (const prompt of noteContentPrompts) {
			noteContentShape[prompt.key] = createZodField(z, prompt);
		}
		rootShape['note_content'] = z.z.object(
			noteContentShape as Parameters<typeof z.z.object>[0]
		);
	}

	return z.z.object(rootShape as Parameters<typeof z.z.object>[0]);
}
