export const unique = (input: string): string => {
	try {
		const parsed = JSON.parse(input);

		if (Array.isArray(parsed)) {
			// For arrays of primitives, use Set
			if (parsed.every(item => typeof item !== 'object')) {
				return JSON.stringify([...new Set(parsed)]);
			}

			// For arrays of objects, compare stringified versions
			const seen = new Set();
			const uniqueArray = parsed.filter(item => {
				const stringified = JSON.stringify(item);
				if (seen.has(stringified)) {
					return false;
				}
				seen.add(stringified);
				return true;
			});

			return JSON.stringify(uniqueArray);
		}

		// For objects, remove duplicate values while keeping the last occurrence's key
		if (typeof parsed === 'object' && parsed !== null) {
			const reverseEntries = Object.entries(parsed).reverse();
			const seen = new Set();
			const uniqueEntries = reverseEntries.filter(([_, value]) => {
				const stringified = JSON.stringify(value);
				if (seen.has(stringified)) {
					return false;
				}
				seen.add(stringified);
				return true;
			}).reverse();

			return JSON.stringify(Object.fromEntries(uniqueEntries));
		}

		// If not an array or object, return unchanged
		return input;
	} catch {
		// If parsing fails, return unchanged
		return input;
	}
}; 