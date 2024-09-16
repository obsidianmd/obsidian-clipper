export const template = (str: string, param?: string): string => {
	if (!param) {
		return str;
	}

	let obj;
	try {
		obj = JSON.parse(str);
	} catch (error) {
		obj = str.split('\n').map(item => {
			try {
				return JSON.parse(item);
			} catch (e) {
				return item;
			}
		});
	}

	if (Array.isArray(obj)) {
		return obj.map(item => replaceTemplateVariables(item, param)).join('\n\n');
	} else {
		return replaceTemplateVariables(obj, param);
	}
};

function replaceTemplateVariables(obj: any, template: string): string {
	let result = template.replace(/\$\{([\w.[\]]+)\}/g, (match, path) => {
		const value = getNestedProperty(obj, path);
		return value !== undefined ? value : '';
	});

	// Remove any empty lines (which might be caused by undefined values)
	result = result.split('\n').filter(line => line.trim() !== '').join('\n');

	// Remove surrounding quotes if present
	result = result.replace(/^"(.*)"$/, '$1');
	
	// Replace escaped newlines with actual newlines
	result = result.replace(/\\n/g, '\n');

	return result;
}

function getNestedProperty(obj: any, path: string): any {
	const result = path.split(/[\.\[\]]/).filter(Boolean).reduce((current, key) => {
		return current && current[key] !== undefined ? current[key] : undefined;
	}, obj);
	return result;
}