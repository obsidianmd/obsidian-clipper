import { Template } from '../types/types';
import { memoize } from './memoize';

// Memoized version of the internal matchPattern function
const memoizedInternalMatchPattern = memoize((pattern: string, url: string, schemaOrgData: any): boolean => {
	if (pattern.startsWith('schema:')) {
		return matchSchemaPattern(pattern, schemaOrgData);
	} else if (pattern.startsWith('/') && pattern.endsWith('/')) {
		try {
			const regexPattern = new RegExp(pattern.slice(1, -1));
			return regexPattern.test(url);
		} catch (error) {
			console.error(`Invalid regex pattern: ${pattern}`, error);
			return false;
		}
	} else {
		return url.startsWith(pattern);
	}
});

interface TriggerMatch {
	template: Template;
	priority: number;
}

class TrieNode {
	children: Map<string, TrieNode> = new Map();
	templates: TriggerMatch[] = [];
}

class Trie {
	root: TrieNode = new TrieNode();

	insert(url: string, template: Template, priority: number) {
		let node = this.root;
		for (const char of url) {
			if (!node.children.has(char)) {
				node.children.set(char, new TrieNode());
			}
			node = node.children.get(char)!;
		}
		node.templates.push({ template, priority });
	}

	findLongestMatch(url: string, schemaOrgData: any): TriggerMatch | null {
		let node = this.root;
		let lastMatch: TriggerMatch | null = null;
		for (const char of url) {
			if (!node.children.has(char)) break;
			node = node.children.get(char)!;
			if (node.templates.length > 0) {
				const matchingTemplate = node.templates.find(t => 
					memoizedInternalMatchPattern(url.slice(0, url.indexOf(char) + 1), url, schemaOrgData)
				);
				if (matchingTemplate) {
					lastMatch = matchingTemplate;
				}
			}
		}
		return lastMatch;
	}
}

const urlTrie = new Trie();
const regexTriggers: Array<{ template: Template; regex: RegExp; priority: number }> = [];
const schemaTriggers: Array<{ template: Template; pattern: string; priority: number }> = [];

let cachedUrl: string | null = null;
let cachedResult: Template | undefined = undefined;

let isInitialized = false;

export function initializeTriggers(templates: Template[]): void {
	urlTrie.root = new TrieNode(); // Reset trie
	regexTriggers.length = 0;
	schemaTriggers.length = 0;

	templates.forEach((template, index) => {
		if (template.triggers) {
			template.triggers.forEach(trigger => {
				const priority = templates.length - index; // Higher priority for earlier templates
				if (trigger.startsWith('/') && trigger.endsWith('/')) {
					regexTriggers.push({ template, regex: new RegExp(trigger.slice(1, -1)), priority });
				} else if (trigger.startsWith('schema:')) {
					schemaTriggers.push({ template, pattern: trigger, priority });
				} else {
					urlTrie.insert(trigger, template, priority);
				}
			});
		}
	});

	isInitialized = true;
}

export async function findMatchingTemplate(url: string, getSchemaOrgData: () => Promise<any>): Promise<Template | undefined> {
	if (!isInitialized) {
		console.warn('Triggers not initialized. Call initializeTriggers first.');
		return undefined;
	}

	const schemaOrgData = await getSchemaOrgData();

	// Check URL trie first
	const urlMatch = urlTrie.findLongestMatch(url, schemaOrgData);
	if (urlMatch) {
		console.log('URL match found:', urlMatch);
		return urlMatch.template;
	}

	// Then check regex triggers
	for (const { template, regex } of regexTriggers) {
		if (memoizedInternalMatchPattern(regex.source, url, schemaOrgData)) {
			console.log('Regex match found:', template);
			return template;
		}
	}

	// If no URL or regex match, check schema triggers
	for (const { template, pattern } of schemaTriggers) {
		if (memoizedInternalMatchPattern(pattern, url, schemaOrgData)) {
			console.log('Schema match found:', template);
			return template;
		}
	}

	return undefined;
}

export function matchPattern(pattern: string, url: string, schemaOrgData: any): boolean {
	return memoizedInternalMatchPattern(pattern, url, schemaOrgData);
}

function matchSchemaPattern(pattern: string, schemaOrgData: any): boolean {
	const [, schemaType, schemaKey, expectedValue] = pattern.match(/schema:(@\w+)?(?:\.(.+?))?(?:=(.+))?$/) || [];
	
	if (!schemaType && !schemaKey) return false;

	// Ensure schemaOrgData is always an array
	const schemaArray = Array.isArray(schemaOrgData) ? schemaOrgData : [schemaOrgData];

	const matchingSchemas = schemaArray.flatMap(schema => {
		// Handle nested arrays of schemas
		if (Array.isArray(schema)) {
			return schema;
		}
		return [schema];
	}).filter((schema: any) => {
		if (!schemaType) return true;
		const types = Array.isArray(schema['@type']) ? schema['@type'] : [schema['@type']];
		return types.includes(schemaType.slice(1));
	});

	for (const schema of matchingSchemas) {
		if (schemaKey) {
			const actualValue = getSchemaValue(schema, schemaKey);
			if (expectedValue) {
				if (Array.isArray(actualValue)) {
					if (actualValue.includes(expectedValue)) return true;
				} else if (actualValue === expectedValue) {
					return true;
				}
			} else if (actualValue !== undefined) {
				return true;
			}
		} else {
			return true; // Match if only schema type is specified and found
		}
	}

	return false;
}

function getSchemaValue(schemaData: any, key: string): any {
	const keys = key.split('.');
	let result = schemaData;
	for (const k of keys) {
		if (result && typeof result === 'object' && k in result) {
			result = result[k];
		} else {
			return undefined;
		}
	}
	return result;
}