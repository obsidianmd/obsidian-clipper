export const uncamel = (str: string): string => {
	// Add space before any uppercase letter that follows a lowercase letter or number
	const spaced = str.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
	
	// Add space before any uppercase letter that follows another uppercase letter and is followed by a lowercase letter
	return spaced.replace(/([A-Z])([A-Z][a-z])/g, '$1 $2').toLowerCase();
};