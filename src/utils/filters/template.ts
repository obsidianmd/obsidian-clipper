export const template = (input: string | any[], param?: string): string => {
	if (!param) {
		return typeof input === 'string' ? input : JSON.stringify(input);
	}

	let obj;
	if (typeof input === 'string') {
		try {
			obj = JSON.parse(input);
		} catch (error) {
			obj = input;
		}
	} else {
		obj = input;
	}

	if (Array.isArray(obj)) {
		return obj.map(item => replaceTemplateVariables(item, param)).join('\n\n');
	} else {
		return replaceTemplateVariables(obj, param);
	}
};

function replaceTemplateVariables(obj: any, template: string): string {
	// Remove the outer quotes if they exist
	template = template.replace(/^"(.*)"$/, '$1');

	let result = template.replace(/\$\{([\w.[\]]+)\}/g, (match, path) => {
		const value = getNestedProperty(obj, path);
		return value !== undefined ? value : '';
	});

	// Replace \n with actual newlines
	result = result.replace(/\\n/g, '\n');

	// Remove any empty lines (which might be caused by undefined values)
	result = result.split('\n').filter(line => line.trim() !== '').join('\n');

	return result.trim();
}

function getNestedProperty(obj: any, path: string): any {
	const result = path.split(/[\.\[\]]/).filter(Boolean).reduce((current, key) => {
		return current && current[key] !== undefined ? current[key] : undefined;
	}, obj);
	return result;
}