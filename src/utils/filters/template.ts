export const template = (input: string | any[], param?: string): string => {
	console.log('Template input:', input);
	console.log('Template param:', param);

	if (!param) {
		console.log('No param provided, returning input');
		return typeof input === 'string' ? input : JSON.stringify(input);
	}

	let obj = input;
	if (typeof input === 'string') {
		try {
			obj = JSON.parse(input);
			console.log('Parsed input:', obj);
		} catch (error) {
			console.log('Parsing failed, using input as string');
		}
	}

	console.log('Object to process:', obj);

	if (Array.isArray(obj)) {
		console.log('Processing array');
		const result = obj.map(item => replaceTemplateVariables(item, param)).join('\n\n');
		console.log('Array processing result:', result);
		return result;
	} else {
		console.log('Processing single object');
		const result = replaceTemplateVariables(obj, param);
		console.log('Single object processing result:', result);
		return result;
	}
};

function replaceTemplateVariables(obj: any, template: string): string {
	console.log('Replacing template variables for:', obj);
	console.log('Template:', template);

	// Remove the outer quotes if they exist
	template = template.replace(/^"(.*)"$/, '$1');
	console.log('Template after quote removal:', template);

	let result = template.replace(/\$\{([\w.[\]]+)\}/g, (match, path) => {
		console.log('Replacing:', match);
		const value = getNestedProperty(obj, path);
		console.log('Replaced with:', value);
		return value !== undefined ? value : '';
	});

	console.log('Result after variable replacement:', result);

	// Replace \n with actual newlines
	result = result.replace(/\\n/g, '\n');
	console.log('Result after newline replacement:', result);

	// Remove any empty lines (which might be caused by undefined values)
	result = result.split('\n').filter(line => line.trim() !== '').join('\n');
	console.log('Result after empty line removal:', result);

	return result.trim();
}

function getNestedProperty(obj: any, path: string): any {
	console.log('Getting nested property:', { obj, path });
	const result = path.split(/[\.\[\]]/).filter(Boolean).reduce((current, key) => {
		console.log('Current:', current, 'Key:', key);
		return current && current[key] !== undefined ? current[key] : undefined;
	}, obj);
	console.log('Nested property result:', result);
	return result;
}