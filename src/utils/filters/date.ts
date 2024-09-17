import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(customParseFormat);

export const date = (str: string, param?: string): string => {
	// Remove outer parentheses if present and split by comma, respecting quotes
	const paramMatches = param ? param.replace(/^\(|\)$/g, '').match(/(?:[^\s"]+|"[^"]*")+/g) : null;
	const params = paramMatches || [];
	const [outputFormat, inputFormat] = params.map(p => p.replace(/^"|"$/g, '').trim());

	let date;
	if (inputFormat) {
		// If inputFormat is provided, use it to parse the date
		date = dayjs(str, inputFormat, true);
	} else {
		// If no inputFormat, let dayjs try to parse it automatically
		date = dayjs(str);
	}

	if (!date.isValid()) {
		console.error('Invalid date for date filter:', str);
		return str;
	}

	// Use outputFormat if provided, otherwise use 'YYYY-MM-DD' as default
	return date.format(outputFormat || 'YYYY-MM-DD');
};