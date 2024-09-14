export const list = (str: string, param?: string) => {
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
};