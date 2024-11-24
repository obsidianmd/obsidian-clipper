export const length = (str: string): string => {
	try {
		// Try to parse as JSON first
		const parsed = JSON.parse(str);
		
		if (Array.isArray(parsed)) {
			// For arrays, return the number of items
			return parsed.length.toString();
		} else if (typeof parsed === 'object' && parsed !== null) {
			// For objects, return the number of keys
			return Object.keys(parsed).length.toString();
		}
		// If parsing succeeds but it's not an array or object, 
		// treat it as a string
		return str.length.toString();
	} catch (error) {
		// If parsing fails, treat as a string and return its length
		return str.length.toString();
	}
}; 