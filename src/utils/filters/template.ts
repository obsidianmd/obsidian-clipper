export const template = (str: string, param?: string): string => {
	if (!param) return str;

	let obj;
	try {
		obj = JSON.parse(str);
	} catch (error) {
		// If parsing fails, use the string as is
		obj = { value: str };
	}

	return param.replace(/\$\{([\w.[\]]+)\}/g, (_, path) => {
		return getNestedProperty(obj, path) || '';
	});
};

function getNestedProperty(obj: any, path: string): any {
	return path.split(/[\.\[\]]/).filter(Boolean).reduce((current, key) => {
		return current && current[key] !== undefined ? current[key] : undefined;
	}, obj);
}