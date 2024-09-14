export const wikilink = (str: string, alias?: string): string => {
	if (!str.trim()) {
		return str;
	}
	try {
		const data = JSON.parse(str);
		
		const processObject = (obj: any): string[] => {
			return Object.entries(obj).map(([key, value]) => {
				if (typeof value === 'object' && value !== null) {
					return processObject(value);
				}
				return `[[${key}|${value}]]`;
			}).flat();
		};

		if (Array.isArray(data)) {
			const result = data.flatMap(item => {
				if (typeof item === 'object' && item !== null) {
					return processObject(item);
				}
				return item ? (alias ? `[[${item}|${alias}]]` : `[[${item}]]`) : '';
			});
			return JSON.stringify(result);
		} else if (typeof data === 'object' && data !== null) {
			return JSON.stringify(processObject(data));
		}
	} catch (error) {
		// If parsing fails, treat it as a single string
		return alias ? `[[${str}|${alias}]]` : `[[${str}]]`;
	}
	return str;
};