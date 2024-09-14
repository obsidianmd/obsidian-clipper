import dayjs from 'dayjs';
import { createMarkdownContent } from './markdown-converter';
import { escapeRegExp } from './string-utils';

export type FilterFunction = (value: string, param?: string) => string;

export const filters: { [key: string]: FilterFunction } = {
	blockquote: (str: string): string => {
		return str.split('\n').map(line => `> ${line}`).join('\n');
	},
	camel: (str: string) => str
		.replace(/(?:^\w|[A-Z]|\b\w)/g, (letter, index) => 
			index === 0 ? letter.toLowerCase() : letter.toUpperCase()
		)
		.replace(/[\s_-]+/g, ''),
	capitalize: (str: string): string => {
		return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
	},
	callout: (str: string, param?: string): string => {
		let type = 'info';
		let title = '';
		let foldState: string | null = null;

		if (param) {
			// Remove outer parentheses if present
			param = param.replace(/^\((.*)\)$/, '$1');
			
			// Split by comma, but respect quoted strings
			const params = param.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(p => p.trim().replace(/^"|"$/g, ''));
			
			if (params.length > 0) type = params[0] || type;
			if (params.length > 1) title = params[1] || title;
			if (params.length > 2) {
				if (params[2] === 'true') foldState = '-';
				else if (params[2] === 'false') foldState = '+';
			}
		}

		let calloutHeader = `> [!${type}]`;
		if (foldState) calloutHeader += foldState;
		if (title) calloutHeader += ` ${title}`;

		return `${calloutHeader}\n${str.split('\n').map(line => `> ${line}`).join('\n')}`;
	},
	date: (str: string, format?: string): string => {
		const date = dayjs(str);
		if (!date.isValid()) {
			console.error('Invalid date for date filter:', str);
			return str;
		}
		return format ? date.format(format) : date.format();
	},
	first: (str: string): string => {
		try {
			const array = JSON.parse(str);
			if (Array.isArray(array) && array.length > 0) {
				return array[0].toString();
			}
		} catch (error) {
			console.error('Error parsing JSON in first filter:', error);
		}
		return str;
	},
	footnote: (str: string): string => {
		try {
			const data = JSON.parse(str);
			if (Array.isArray(data)) {
				return data.map((item, index) => `[^${index + 1}]: ${item}`).join('\n\n');
			} else if (typeof data === 'object' && data !== null) {
				return Object.entries(data).map(([key, value]) => {
					const footnoteId = key.replace(/([a-z])([A-Z])/g, '$1-$2')
						.replace(/[\s_]+/g, '-')
						.toLowerCase();
					return `[^${footnoteId}]: ${value}`;
				}).join('\n\n');
			}
		} catch (error) {
			console.error('Error parsing JSON in footnote filter:', error);
		}
		return str;
	},
	image: (str: string, altText?: string): string => {
		try {
			const data = JSON.parse(str);
			
			if (Array.isArray(data)) {
				const result = data.map(item => `![${altText || ''}](${escapeMarkdown(item)})`);
				return JSON.stringify(result);
			} else if (typeof data === 'object' && data !== null) {
				return Object.entries(data)
					.map(([alt, url]) => `![${escapeMarkdown(alt)}](${escapeMarkdown(String(url))})`).join('\n');
			}
		} catch (error) {
			// If parsing fails, treat it as a single string
			return `![${altText || ''}](${escapeMarkdown(str)})`;
		}
		return str;
	},
	join: (str: string, param?: string): string => {
		let array;
		try {
			array = JSON.parse(str);
		} catch (error) {
			console.error('Error parsing JSON in join filter:', error);
			return str;
		}

		if (Array.isArray(array)) {
			const separator = param ? JSON.parse(`"${param}"`) : ',';
			return array.join(separator);
		}
		return str;
	},
	kebab: (str: string) => str
		.replace(/([a-z])([A-Z])/g, '$1-$2')
		.replace(/[\s_]+/g, '-')
		.toLowerCase(),
	last: (str: string): string => {
		try {
			const array = JSON.parse(str);
			if (Array.isArray(array) && array.length > 0) {
				return array[array.length - 1].toString();
			}
		} catch (error) {
			console.error('Error parsing JSON in last filter:', error);
		}
		return str;
	},
	list: (str: string, param?: string) => {
		try {
			const arrayValue = JSON.parse(str);
			if (Array.isArray(arrayValue)) {
				switch (param) {
					case 'numbered':
						return arrayValue.map((item, index) => `${index + 1}. ${item}`).join('\n');
					case 'task':
						return arrayValue.map(item => `- [ ] ${item}`).join('\n');
					case 'numbered-task':
						return arrayValue.map((item, index) => `${index + 1}. [ ] ${item}`).join('\n');
					default:
						return arrayValue.map(item => `- ${item}`).join('\n');
				}
			}
		} catch (error) {
			console.error('Error parsing JSON for list filter:', error);
		}
		return str;
	},
	lower: (str: string): string => {
		return str.toLowerCase();
	},
	markdown: (str: string, url?: string): string => {
		const baseUrl = url || 'about:blank';
		try {
			return createMarkdownContent(str, baseUrl);
		} catch (error) {
			console.error('Error in createMarkdownContent:', error);
			return str;
		}
	},
	object: (str: string, param?: string): string => {
		try {
			const obj = JSON.parse(str);
			if (typeof obj === 'object' && obj !== null) {
				switch (param) {
					case 'array':
						return JSON.stringify(Object.entries(obj));
					case 'keys':
						return JSON.stringify(Object.keys(obj));
					case 'values':
						return JSON.stringify(Object.values(obj));
					default:
						return str; // Return original string if no valid param
				}
			}
		} catch (error) {
			console.error('Error parsing JSON for object filter:', error);
		}
		return str;
	},
	pascal: (str: string) => str
		.replace(/[\s_-]+(.)/g, (_, c) => c.toUpperCase())
		.replace(/^(.)/, c => c.toUpperCase()),
	slice: (str: string, param?: string): string => {
		if (!param) {
			console.error('Slice filter requires parameters');
			return str;
		}

		const [start, end] = param.split(',').map(p => p.trim()).map(p => {
			if (p === '') return undefined;
			const num = parseInt(p, 10);
			return isNaN(num) ? undefined : num;
		});

		let value;
		try {
			value = JSON.parse(str);
		} catch (error) {
			console.error('Error parsing JSON in slice filter:', error);
			value = str;
		}

		if (Array.isArray(value)) {
			const slicedArray = value.slice(start, end);
			if (slicedArray.length === 1) {
				return slicedArray[0].toString();
			}
			return JSON.stringify(slicedArray);
		} else {
			const slicedString = str.slice(start, end);
			return slicedString;
		}
	},
	snake: (str: string) => str
		.replace(/([a-z])([A-Z])/g, '$1_$2')
		.replace(/[\s-]+/g, '_')
		.toLowerCase(),
	split: (str: string, param?: string): string => {
		if (!param) {
			console.error('Split filter requires a separator parameter');
			return JSON.stringify([str]);
		}

		// Remove quotes from the param if present
		param = param.replace(/^["']|["']$/g, '');

		// If param is a single character, use it directly
		const separator = param.length === 1 ? param : new RegExp(param);

		// Split operation
		const result = str.split(separator);

		return JSON.stringify(result);
	},
	table: (str: string): string => {
		try {
			const data = JSON.parse(str);
			if (!Array.isArray(data) || data.length === 0) {
				return str;
			}

			// Function to escape pipe characters in cell content
			const escapeCell = (cell: string) => cell.replace(/\|/g, '\\|');

			// Handle array of objects
			if (typeof data[0] === 'object' && data[0] !== null) {
				const headers = Object.keys(data[0]);
				let table = `| ${headers.join(' | ')} |\n| ${headers.map(() => '-').join(' | ')} |\n`;
				
				data.forEach(row => {
					table += `| ${headers.map(header => escapeCell(String(row[header] || ''))).join(' | ')} |\n`;
				});

				return table.trim();
			}

			// Handle array of arrays
			if (Array.isArray(data[0])) {
				const maxColumns = Math.max(...data.map(row => row.length));
				let table = `| ${Array(maxColumns).fill('').join(' | ')} |\n| ${Array(maxColumns).fill('-').join(' | ')} |\n`;

				data.forEach(row => {
					const paddedRow = [...row, ...Array(maxColumns - row.length).fill('')];
					table += `| ${paddedRow.map(cell => escapeCell(String(cell))).join(' | ')} |\n`;
				});

				return table.trim();
			}

			// Handle simple array
			let table = "| Value |\n| - |\n";
			data.forEach(item => {
				table += `| ${escapeCell(String(item))} |\n`;
			});

			return table.trim();
		} catch (error) {
			console.error('Error parsing JSON for table filter:', error);
			return str;
		}
	},
	trim: (str: string): string => {
		return str.trim();
	},
	replace: (str: string, param?: string): string => {
		if (!param) {
			console.error('Replace filter requires parameters');
			return str;
		}

		const parts = param.split(',').map(part => part.trim());
		if (parts.length >= 2) {
			const result = parts.reduce((acc, part, index, array) => {
				if (index % 2 === 0 && index + 1 < array.length) {
					const search = part.replace(/^["'{]|[}"']$/g, '');
					const replace = array[index + 1].replace(/^["'{]|[}"']$/g, '');
					const searchRegex = new RegExp(escapeRegExp(search), 'gi');
					return acc.replace(searchRegex, replace);
				}
				return acc;
			}, str);
			return result;
		}
		return str;
	},
	title: (str: string): string => {
		return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
	},
	upper: (str: string): string => {
		return str.toUpperCase();
	},
	wikilink: (str: string, alias?: string): string => {
		if (!str.trim()) {
			return str;
		}
		try {
			const data = JSON.parse(str);
			
			const processObject = (obj: any): string[] => {
				return Object.entries(obj).map(([key, value]) => {
					if (typeof value === 'object' && value !== null) {
						return processObject(value);
					}
					return `[[${key}|${value}]]`;
				}).flat();
			};

			if (Array.isArray(data)) {
				const result = data.flatMap(item => {
					if (typeof item === 'object' && item !== null) {
						return processObject(item);
					}
					return item ? (alias ? `[[${item}|${alias}]]` : `[[${item}]]`) : '';
				});
				return JSON.stringify(result);
			} else if (typeof data === 'object' && data !== null) {
				return JSON.stringify(processObject(data));
			}
		} catch (error) {
			// If parsing fails, treat it as a single string
			return alias ? `[[${str}|${alias}]]` : `[[${str}]]`;
		}
		return str;
	}
};

// Add this helper function at the end of the file
function escapeMarkdown(str: string): string {
	return str.replace(/([[\]])/g, '\\$1');
}

export function applyFilters(value: string, filterNames: string[], url?: string): string {
	// Ensure value is a string before applying filters
	let processedValue = typeof value === 'string' ? value : JSON.stringify(value);

	const result = filterNames.reduce((result, filterName) => {
		const filterRegex = /(\w+)(?::(.+)|"(.+)")?/;
		const match = filterName.match(filterRegex);

		if (match) {
			const [, name, param1, param2] = match;
			const cleanParam = (param1 || param2) ? (param1 || param2).replace(/^["']|["']$/g, '') : undefined;

			const filter = filters[name];
			if (filter) {
				// Pass the URL to the markdown filter, use cleanParam for others
				const output = name === 'markdown' ? filter(result, url) : filter(result, cleanParam);
				return output;
			}
		} else {
			console.error(`Invalid filter format: ${filterName}`);
		}

		return result;
	}, processedValue);

	return result;
}