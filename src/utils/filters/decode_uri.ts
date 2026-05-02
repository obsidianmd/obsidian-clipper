export const decode_uri = (str: string): string => {
	try {
		return decodeURIComponent(str);
	} catch {
		// If decoding fails (e.g., malformed URI), return the original string
		return str;
	}
};
