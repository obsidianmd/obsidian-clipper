import { Template } from '../types/types';

export function findMatchingTemplate(url: string, templates: Template[], schemaOrgData: any): Template | undefined {
	return templates.find(template => 
		template.triggers && template.triggers.some(pattern => matchPattern(pattern, url, schemaOrgData))
	);
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
