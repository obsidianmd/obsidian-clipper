export const template = (input: string | any[], param?: string): string => {
	console.log('Template input:', input);
	console.log('Template param:', param);

	if (!param) {
		console.log('No param provided, returning input');
		return typeof input === 'string' ? input : JSON.stringify(input);
	}

	let obj: any[] = [];
	if (typeof input === 'string') {
		try {
			obj = JSON.parse(input);
			console.log('Parsed input:', obj);
		} catch (error) {
			console.log('Parsing failed, using input as is');
			obj = [input];
		}
	} else {
		obj = input;
	}

	// Ensure obj is always an array
	obj = Array.isArray(obj) ? obj : [obj];

	console.log('Object to process:', obj);

	const result = obj.map(item => replaceTemplateVariables(item, param)).join('\n\n');
	console.log('Processing result:', result);
	return result;
};

function replaceTemplateVariables(obj: any, template: string): string {
	console.log('Replacing template variables for:', obj);
	console.log('Template:', template);

	// Remove the outer quotes if they exist
	template = template.replace(/^"(.*)"$/, '$1');
	console.log('Template after quote removal:', template);

	// If obj is a string that looks like an object, try to parse it
	if (typeof obj === 'string') {
		try {
			// Remove any outer parentheses and parse
			const objString = obj.replace(/^\(|\)$/g, '').trim();
			obj = parseObjectString(objString);
			console.log('Parsed object:', obj);
		} catch (error) {
			console.log('Failed to parse object string:', obj);
		}
	}

	let result = template.replace(/\$\{([\w.]+)\}/g, (match, path) => {
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
		obj[key] = value;
	}

	return obj;
}

function getNestedProperty(obj: any, path: string): any {
	console.log('Getting nested property:', { obj, path });
	const result = path.split('.').reduce((current, key) => {
		return current && typeof current === 'object' ? current[key] : undefined;
	}, obj);
	console.log('Nested property result:', result);
	return result;
}