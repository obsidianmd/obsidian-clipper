export const object = (str: string, param?: string): string => {
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
};