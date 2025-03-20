export const reverse = (str: string): string => {
	// Return early if input is empty or invalid
	if (!str || str === 'undefined' || str === 'null') {
		return '';
	}

	try {
		const value = JSON.parse(str);
		if (Array.isArray(value)) {
			// Handle arrays
			return JSON.stringify(value.reverse());
		} else if (typeof value === 'object' && value !== null) {
			// Handle objects by reversing key-value pairs
			const entries = Object.entries(value);
			const reversedEntries = entries.reverse();
			const reversedObject = Object.fromEntries(reversedEntries);
			return JSON.stringify(reversedObject);
		}
	} catch (error) {
		// If not valid JSON, treat as string
		return str.split('').reverse().join('');
	}

	return str;
}; 