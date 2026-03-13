import { sanitizeFileName, getDomain } from './string-utils';
import { escapeDoubleQuotes } from './string-utils';
import { Property } from '../types/types';
import dayjs from 'dayjs';

/**
 * Build template variables from defuddle extraction result.
 * CLI equivalent of initializePageContent() without browser dependencies.
 *
 * When defuddle is called with `markdown: true`, `result.content` is already markdown.
 * Pass the original HTML as `contentHtml` for the `{{contentHtml}}` variable.
 */
export function buildVariables(
	result: {
		content: string;
		title: string;
		author: string;
		description: string;
		image: string;
		favicon: string;
		published: string;
		site: string;
		wordCount: number;
		language: string;
		schemaOrgData?: any;
		metaTags?: { name?: string | null; property?: string | null; content: string | null }[];
		variables?: Record<string, string>;
	},
	url: string,
	fullHtml: string,
	contentHtml?: string
): Record<string, string> {
	const currentUrl = url.replace(/#:~:text=[^&]+(&|$)/, '');
	const noteName = sanitizeFileName(result.title);
	// When markdown: true, defuddle already returns markdown in content
	const markdownBody = result.content;

	const variables: Record<string, string> = {
		'{{author}}': (result.author || '').trim(),
		'{{content}}': markdownBody.trim(),
		'{{contentHtml}}': (contentHtml || result.content || '').trim(),
		'{{selection}}': '',
		'{{selectionHtml}}': '',
		'{{date}}': dayjs().format('YYYY-MM-DDTHH:mm:ssZ'),
		'{{time}}': dayjs().format('YYYY-MM-DDTHH:mm:ssZ'),
		'{{description}}': (result.description || '').trim(),
		'{{domain}}': getDomain(currentUrl),
		'{{favicon}}': result.favicon || '',
		'{{fullHtml}}': fullHtml.trim(),
		'{{highlights}}': '',
		'{{image}}': result.image || '',
		'{{noteName}}': noteName.trim(),
		'{{published}}': (result.published || '').split(',')[0].trim(),
		'{{site}}': (result.site || '').trim(),
		'{{title}}': (result.title || '').trim(),
		'{{url}}': currentUrl.trim(),
		'{{language}}': (result.language || '').trim(),
		'{{words}}': (result.wordCount || 0).toString(),
	};

	// Add defuddle extracted variables (e.g. transcript)
	if (result.variables) {
		for (const [key, value] of Object.entries(result.variables)) {
			variables[`{{${key}}}`] = value;
		}
	}

	// Add meta tags
	if (result.metaTags) {
		for (const meta of result.metaTags) {
			if (meta.name && meta.content) {
				variables[`{{meta:name:${meta.name}}}`] = meta.content;
			}
			if (meta.property && meta.content) {
				variables[`{{meta:property:${meta.property}}}`] = meta.content;
			}
		}
	}

	// Add schema.org data
	if (result.schemaOrgData) {
		addSchemaOrgDataToVariables(result.schemaOrgData, variables);
	}

	return variables;
}

/**
 * Recursive schema.org data processor.
 * Copied from content-extractor.ts to avoid browser imports.
 */
function addSchemaOrgDataToVariables(schemaData: any, variables: Record<string, string>, prefix: string = ''): void {
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

/**
 * Generate YAML frontmatter from compiled properties.
 * CLI equivalent of generateFrontmatter() without browser storage dependency.
 */
export function generateFrontmatterCLI(
	properties: Property[],
	propertyTypes?: Record<string, string>
): string {
	let frontmatter = '---\n';
	for (const property of properties) {
		const needsQuotes = /[:\s\{\}\[\],&*#?|<>=!%@\\-]/.test(property.name)
			|| /^[\d]/.test(property.name)
			|| /^(true|false|null|yes|no|on|off)$/i.test(property.name.trim());
		const propertyKey = needsQuotes
			? (property.name.includes('"')
				? `'${property.name.replace(/'/g, "''")}'`
				: `"${property.name}"`)
			: property.name;
		frontmatter += `${propertyKey}:`;

		const propertyType = propertyTypes?.[property.name] || 'text';

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

/**
 * Extract content by CSS selector from a linkedom document.
 * CLI equivalent of extractContentBySelector() from content.ts.
 */
export function extractContentBySelector(
	document: any,
	selector: string,
	attribute?: string,
	extractHtml: boolean = false
): string | string[] {
	try {
		const elements = document.querySelectorAll(selector);

		if (elements.length > 1) {
			return Array.from(elements).map((el: any) => {
				if (attribute) {
					return el.getAttribute(attribute) || '';
				}
				return extractHtml ? el.outerHTML : el.textContent?.trim() || '';
			});
		} else if (elements.length === 1) {
			if (attribute) {
				return elements[0].getAttribute(attribute) || '';
			}
			return extractHtml ? elements[0].outerHTML : elements[0].textContent?.trim() || '';
		} else {
			return '';
		}
	} catch (error) {
		console.error('Error in extractContentBySelector:', error);
		return '';
	}
}

/**
 * Open a note in Obsidian via URI scheme.
 */
export async function openInObsidian(
	fileContent: string,
	noteName: string,
	path: string,
	vault: string,
	behavior: string,
	silent: boolean
): Promise<void> {
	const { exec } = await import('child_process');
	const { promisify } = await import('util');
	const execAsync = promisify(exec);

	const isDailyNote = behavior === 'append-daily' || behavior === 'prepend-daily';

	let obsidianUrl: string;
	if (isDailyNote) {
		obsidianUrl = `obsidian://daily?`;
	} else {
		if (path && !path.endsWith('/')) {
			path += '/';
		}
		const formattedNoteName = sanitizeFileName(noteName);
		obsidianUrl = `obsidian://new?file=${encodeURIComponent(path + formattedNoteName)}`;
	}

	if (behavior.startsWith('append')) {
		obsidianUrl += '&append=true';
	} else if (behavior.startsWith('prepend')) {
		obsidianUrl += '&prepend=true';
	} else if (behavior === 'overwrite') {
		obsidianUrl += '&overwrite=true';
	}

	if (vault) {
		obsidianUrl += `&vault=${encodeURIComponent(vault)}`;
	}

	if (silent) {
		obsidianUrl += '&silent=true';
	}

	obsidianUrl += `&content=${encodeURIComponent(fileContent)}`;

	const platform = process.platform;
	let command: string;
	if (platform === 'darwin') {
		command = `open "${obsidianUrl}"`;
	} else if (platform === 'win32') {
		command = `start "" "${obsidianUrl}"`;
	} else {
		command = `xdg-open "${obsidianUrl}"`;
	}

	await execAsync(command);
}
