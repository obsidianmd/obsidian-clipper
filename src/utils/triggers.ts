import { Template } from '../types/types';

// Simple memoize function
function memoize<T extends (...args: any[]) => any>(fn: T): T {
	const cache = new Map<string, ReturnType<T>>();
	return ((...args: Parameters<T>): ReturnType<T> => {
		const key = JSON.stringify(args);
		if (cache.has(key)) {
			return cache.get(key)!;
		}
		const result = fn(...args);
		cache.set(key, result);
		return result;
	}) as T;
}

// Create a memoized version of the matchPattern function
const memoizedMatchPattern = memoize((pattern: string, url: string, schemaOrgData: any): boolean => {
	return matchPattern(pattern, url, schemaOrgData);
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

	findLongestMatch(url: string): TriggerMatch | null {
		let node = this.root;
		let lastMatch: TriggerMatch | null = null;
		for (const char of url) {
			if (!node.children.has(char)) break;
			node = node.children.get(char)!;
			if (node.templates.length > 0) {
				lastMatch = node.templates.reduce((a, b) => a.priority > b.priority ? a : b);
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

export function findMatchingTemplate(url: string, getSchemaOrgData: () => Promise<any>): Promise<Template | undefined> {
	if (!isInitialized) {
		console.warn('Triggers not initialized. Call initializeTriggers first.');
		return Promise.resolve(undefined);
	}

	// Remove the cache check, as we want to always perform the matching

	// Check URL trie first
	const urlMatch = urlTrie.findLongestMatch(url);
	if (urlMatch) {
		console.log('URL match found:', urlMatch);
		return Promise.resolve(urlMatch.template);
	}

	// Then check regex triggers
	for (const { template, regex } of regexTriggers) {
		if (regex.test(url)) {
			console.log('Regex match found:', template);
			return Promise.resolve(template);
		}
	}

	// If no URL or regex match, check schema triggers
	if (schemaTriggers.length > 0) {
		return getSchemaOrgData().then(schemaOrgData => {
			for (const { template, pattern } of schemaTriggers) {
				if (matchSchemaPattern(pattern, schemaOrgData)) {
					console.log('Schema match found:', template);
					return template;
				}
			}
			console.log('No schema match found');
			return undefined;
		});
	}

	console.log('No match found');
	return Promise.resolve(undefined);
}

function checkTriggers(triggers: Array<{ template: Template; trigger: string }>, url: string, schemaOrgData: any): Template | undefined {
	for (const { template, trigger } of triggers) {
		if (memoizedMatchPattern(trigger, url, schemaOrgData)) {
			return template;
		}
	}
	return undefined;
}

export function matchPattern(pattern: string, url: string, schemaOrgData: any): boolean {
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