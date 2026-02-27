import { debugLog } from '../debug';
import type { ParamValidationResult } from '../filters';

export const validateTemplateParams = (param: string | undefined): ParamValidationResult => {
	if (!param) {
		return { valid: false, error: 'requires a template string (e.g., template:"${name}")' };
	}

	return { valid: true };
};

export const template = (input: string | any[], param?: string): string => {
	debugLog('Template', 'Template input:', input);
	debugLog('Template', 'Template param:', param);

	if (!param) {
		debugLog('Template', 'No param provided, returning input');
		return typeof input === 'string' ? input : JSON.stringify(input);
	}

	// Remove outer parentheses if present
	param = param.replace(/^\((.*)\)$/, '$1');
	// Remove surrounding quotes (both single and double)
	param = param.replace(/^(['"])([\s\S]*)\1$/, '$2');

	let obj: any[] = [];
	if (typeof input === 'string') {
		try {
			obj = JSON.parse(input);
			debugLog('Template', 'Parsed input:', obj);
		} catch (error) {
			debugLog('Template', 'Parsing failed, using input as is');
			obj = [input];
		}
	} else {
		obj = input;
	}

	// Ensure obj is always an array
	obj = Array.isArray(obj) ? obj : [obj];

	debugLog('Template', 'Object to process:', obj);

	const result = obj.map(item => replaceTemplateVariables(item, param)).join('\n\n');
	debugLog('Template', 'Processing result:', result);
	return result;
};

function replaceTemplateVariables(obj: any, template: string): string {
	debugLog('Template', 'Replacing template variables for:', obj);
	debugLog('Template', 'Template:', template);

	// If obj is a plain string, make it available as ${str} for template compatibility
	if (typeof obj === 'string') {
		const strValue = obj;
		try {
			obj = parseObjectString(obj);
			debugLog('Template', 'Parsed object:', obj);
		} catch (error) {
			debugLog('Template', 'Failed to parse object string:', obj);
		}
		// Ensure str property is set for plain strings
		if (obj.str === undefined) {
			obj.str = strValue;
		}
	}

	let result = template.replace(/\$\{([\w.]+)\}/g, (match, path) => {
		debugLog('Template', 'Replacing:', match);
		const value = getNestedProperty(obj, path);
		debugLog('Template', 'Replaced with:', value);
		return value !== undefined && value !== 'undefined' ? value : '';
	});

	debugLog('Template', 'Result after variable replacement:', result);

	// Replace \n with actual newlines
	result = result.replace(/\\n/g, '\n');
	debugLog('Template', 'Result after newline replacement:', result);

	// Remove any empty lines (which might be caused by undefined values)
	result = result.split('\n').filter(line => line.trim() !== '').join('\n');
	debugLog('Template', 'Result after empty line removal:', result);

	return result.trim();
}

function parseObjectString(str: string): any {
	const obj: any = {};
	const regex = /(\w+):\s*("(?:\\.|[^"\\])*"|[^,}]+)/g;
	let match;

	while ((match = regex.exec(str)) !== null) {
		let [, key, value] = match;
		// Remove quotes from the value if it's a string
		if (value.startsWith('"') && value.endsWith('"')) {
			value = value.slice(1, -1);
		}
		obj[key] = value === 'undefined' ? undefined : value;
	}

	return obj;
}

function getNestedProperty(obj: any, path: string): any {
	debugLog('Template', 'Getting nested property:', { obj, path });
	const result = path.split('.').reduce((current, key) => {
		return current && typeof current === 'object' ? current[key] : undefined;
	}, obj);
	debugLog('Template', 'Nested property result:', result);
	return result;
}
