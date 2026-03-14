// Shared pure functions used by both the browser extension and CLI.
// This module must NOT import any browser-specific APIs (webextension-polyfill,
// storage-utils, browser globals). All browser-dependent behavior is injected
// via parameters.

import { sanitizeFileName, getDomain, escapeDoubleQuotes } from './string-utils';
import { Property } from '../types/types';
import dayjs from 'dayjs';

// ---------------------------------------------------------------------------
// Variable building
// ---------------------------------------------------------------------------

export interface BuildVariablesParams {
	title: string;
	author: string;
	content: string;
	contentHtml: string;
	url: string;
	fullHtml: string;
	description: string;
	favicon: string;
	image: string;
	published: string;
	site: string;
	language: string;
	wordCount: number;
	selection?: string;
	selectionHtml?: string;
	highlights?: string;
	schemaOrgData?: any;
	metaTags?: { name?: string | null; property?: string | null; content: string | null }[];
	extractedContent?: Record<string, string>;
}

/**
 * Build the template variable dictionary from extracted page data.
 * Pure function — no browser dependencies.
 */
export function buildVariables(params: BuildVariablesParams): Record<string, string> {
	const currentUrl = params.url.replace(/#:~:text=[^&]+(&|$)/, '');
	const noteName = sanitizeFileName(params.title);

	const timestamp = dayjs().format('YYYY-MM-DDTHH:mm:ssZ');
	const variables: Record<string, string> = {
		'{{author}}': (params.author || '').trim(),
		'{{content}}': (params.content || '').trim(),
		'{{contentHtml}}': (params.contentHtml || '').trim(),
		'{{selection}}': (params.selection || '').trim(),
		'{{selectionHtml}}': (params.selectionHtml || '').trim(),
		'{{date}}': timestamp,
		'{{time}}': timestamp,
		'{{description}}': (params.description || '').trim(),
		'{{domain}}': getDomain(currentUrl),
		'{{favicon}}': params.favicon || '',
		'{{fullHtml}}': (params.fullHtml || '').trim(),
		'{{highlights}}': params.highlights || '',
		'{{image}}': params.image || '',
		'{{noteName}}': noteName.trim(),
		'{{published}}': (params.published || '').split(',')[0].trim(),
		'{{site}}': (params.site || '').trim(),
		'{{title}}': (params.title || '').trim(),
		'{{url}}': currentUrl.trim(),
		'{{language}}': (params.language || '').trim(),
		'{{words}}': (params.wordCount ?? 0).toString(),
	};

	// Add extracted content (e.g. defuddle variables like transcript)
	if (params.extractedContent) {
		for (const [key, value] of Object.entries(params.extractedContent)) {
			variables[`{{${key}}}`] = value;
		}
	}

	// Add meta tags
	if (params.metaTags) {
		for (const meta of params.metaTags) {
			if (meta.name && meta.content) {
				variables[`{{meta:name:${meta.name}}}`] = meta.content;
			}
			if (meta.property && meta.content) {
				variables[`{{meta:property:${meta.property}}}`] = meta.content;
			}
		}
	}

	// Add schema.org data
	if (params.schemaOrgData) {
		addSchemaOrgDataToVariables(params.schemaOrgData, variables);
	}

	return variables;
}

// ---------------------------------------------------------------------------
// Schema.org data processing
// ---------------------------------------------------------------------------

export function addSchemaOrgDataToVariables(schemaData: any, variables: Record<string, string>, prefix: string = ''): void {
	if (Array.isArray(schemaData)) {
		schemaData.forEach((item, index) => {
			if (!item || typeof item !== 'object') return;
			if (item['@type']) {
				if (Array.isArray(item['@type'])) {
					item['@type'].forEach((type: string) => {
						addSchemaOrgDataToVariables(item, variables, `@${type}:`);
					});
				} else {
					addSchemaOrgDataToVariables(item, variables, `@${item['@type']}:`);
				}
			} else {
				addSchemaOrgDataToVariables(item, variables, `[${index}]:`);
			}
		});
	} else if (typeof schemaData === 'object' && schemaData !== null) {
		const objectKey = `{{schema:${prefix.replace(/\.$/, '')}}}`;
		variables[objectKey] = JSON.stringify(schemaData);

		Object.entries(schemaData).forEach(([key, value]) => {
			if (key === '@type') return;

			const variableKey = `{{schema:${prefix}${key}}}`;
			if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
				variables[variableKey] = String(value);
			} else if (Array.isArray(value)) {
				variables[variableKey] = JSON.stringify(value);
				value.forEach((item, index) => {
					addSchemaOrgDataToVariables(item, variables, `${prefix}${key}[${index}].`);
				});
			} else if (typeof value === 'object' && value !== null) {
				addSchemaOrgDataToVariables(value, variables, `${prefix}${key}.`);
			}
		});
	}
}

// ---------------------------------------------------------------------------
// Frontmatter generation
// ---------------------------------------------------------------------------

/**
 * Generate YAML frontmatter from compiled properties.
 * Property types are passed in as a map rather than read from browser storage.
 */
export function generateFrontmatter(
	properties: Property[],
	propertyTypes: Record<string, string> = {}
): string {
	let frontmatter = '---\n';
	for (const property of properties) {
		const trimmedName = property.name.trim();
		const needsQuotes = /[:\s\{\}\[\],&*#?|<>=!%@\\-]/.test(trimmedName)
			|| /^\d/.test(trimmedName)
			|| /^(true|false|null|yes|no|on|off)$/i.test(trimmedName);
		const propertyKey = needsQuotes
			? (property.name.includes('"')
				? `'${property.name.replace(/'/g, "''")}'`
				: `"${property.name}"`)
			: property.name;
		frontmatter += `${propertyKey}:`;

		const propertyType = propertyTypes[property.name] || 'text';

		switch (propertyType) {
			case 'multitext': {
				let items: string[];
				if (property.value.trim().startsWith('["') && property.value.trim().endsWith('"]')) {
					try {
						items = JSON.parse(property.value);
					} catch {
						items = property.value.split(',').map(item => item.trim());
					}
				} else {
					items = property.value.split(/,(?![^\[]*\]\])/).map(item => item.trim());
				}
				items = items.filter(item => item !== '');
				if (items.length > 0) {
					frontmatter += '\n';
					items.forEach(item => {
						frontmatter += `  - "${escapeDoubleQuotes(item)}"\n`;
					});
				} else {
					frontmatter += '\n';
				}
				break;
			}
			case 'number': {
				const numericValue = property.value.replace(/[^\d.-]/g, '');
				frontmatter += numericValue ? ` ${parseFloat(numericValue)}\n` : '\n';
				break;
			}
			case 'checkbox': {
				const isChecked = typeof property.value === 'boolean' ? property.value : property.value === 'true';
				frontmatter += ` ${isChecked}\n`;
				break;
			}
			case 'date':
			case 'datetime':
				frontmatter += property.value.trim() !== '' ? ` ${property.value}\n` : '\n';
				break;
			default:
				frontmatter += property.value.trim() !== '' ? ` "${escapeDoubleQuotes(property.value)}"\n` : '\n';
		}
	}
	frontmatter += '---\n';

	if (frontmatter.trim() === '---\n---') {
		return '';
	}

	return frontmatter;
}

// ---------------------------------------------------------------------------
// Property type formatting
// ---------------------------------------------------------------------------

/**
 * Apply type-aware formatting to a compiled property value.
 * Shared by CLI, API, and browser extension.
 *
 * @param value - The compiled template value
 * @param type - Property type (text, number, checkbox, date, datetime, multitext)
 * @param templateValue - The raw template string (used to check for existing |date: filters)
 */
export function formatPropertyValue(value: string, type: string, templateValue: string): string {
	switch (type) {
		case 'number': {
			const numericValue = value.replace(/[^\d.-]/g, '');
			return numericValue ? parseFloat(numericValue).toString() : value;
		}
		case 'checkbox':
			return (value.toLowerCase() === 'true' || value === '1').toString();
		case 'date':
		case 'datetime': {
			if (!templateValue.includes('|date:')) {
				const d = dayjs(value);
				if (d.isValid()) {
					return d.format(type === 'date' ? 'YYYY-MM-DD' : 'YYYY-MM-DDTHH:mm:ssZ');
				}
			}
			return value;
		}
		default:
			return value;
	}
}

// ---------------------------------------------------------------------------
// CSS selector content extraction
// ---------------------------------------------------------------------------

/**
 * Extract content from a document using a CSS selector.
 * Works with any document-like object (browser Document, linkedom, etc.).
 */
export function extractContentBySelector(
	doc: { querySelectorAll: (selector: string) => any },
	selector: string,
	attribute?: string,
	extractHtml: boolean = false
): string | string[] {
	try {
		const elements = doc.querySelectorAll(selector);

		if (elements.length === 0) {
			return '';
		}

		return Array.from(elements).map((el: any) => {
			if (attribute) {
				return el.getAttribute(attribute) || '';
			}
			return extractHtml ? el.outerHTML : el.textContent?.trim() || '';
		});
	} catch (error) {
		console.error('Error in extractContentBySelector:', error);
		return '';
	}
}
