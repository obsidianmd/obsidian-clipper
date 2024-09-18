import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import advancedFormat from 'dayjs/plugin/advancedFormat';

dayjs.extend(customParseFormat);
dayjs.extend(advancedFormat);

export const date = (str: string, param?: string): string => {
	if (!param) {
		return dayjs(str).format('YYYY-MM-DD');
	}

	// Remove outer parentheses if present
	param = param.replace(/^\((.*)\)$/, '$1');
	
	// Split by comma, but respect both single and double quoted strings
	const params = param.split(/,(?=(?:(?:[^"']*["'][^"']*["'])*[^"']*$))/).map(p => {
		// Trim whitespace and remove surrounding quotes (both single and double)
		return p.trim().replace(/^(['"])(.*)\1$/, '$2');
	});

	const [outputFormat, inputFormat] = params;

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

	return date.format(outputFormat);
};