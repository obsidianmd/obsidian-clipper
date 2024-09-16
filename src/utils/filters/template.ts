export const template = (str: string, param?: string): string => {
	console.log('template input:', str);
	console.log('template param:', param);

	if (!param) {
		console.log('No param provided, returning input');
		return str;
	}

	let obj;
	try {
		obj = JSON.parse(str);
	} catch (error) {
		console.log('Parsing failed, using input as array of objects');
		obj = str.split('\n').map(item => {
			try {
				return JSON.parse(item);
			} catch (e) {
				return item;
			}
		});
	}

	console.log('Parsed object:', obj);

	if (Array.isArray(obj)) {
		return obj.map(item => replaceTemplateVariables(item, param)).join('\n\n');
	} else {
		return replaceTemplateVariables(obj, param);
	}
};

function replaceTemplateVariables(obj: any, template: string): string {
	let result = template.replace(/\$\{([\w.[\]]+)\}/g, (match, path) => {
		console.log('Replacing:', { match, path });
		const value = getNestedProperty(obj, path);
		console.log('Replaced with:', value);
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
	console.log('Getting nested property:', { obj, path });
	const result = path.split(/[\.\[\]]/).filter(Boolean).reduce((current, key) => {
		console.log('Accessing key:', key, 'Current value:', current);
		return current && current[key] !== undefined ? current[key] : undefined;
	}, obj);
	console.log('Nested property result:', result);
	return result;
}