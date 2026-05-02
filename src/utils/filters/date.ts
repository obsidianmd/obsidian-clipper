import dayjs from 'dayjs';
import isoWeek from "dayjs/plugin/isoWeek";
import weekOfYear from "dayjs/plugin/weekOfYear";
import customParseFormat from 'dayjs/plugin/customParseFormat';
import advancedFormat from 'dayjs/plugin/advancedFormat';

dayjs.extend(customParseFormat);
dayjs.extend(isoWeek);
dayjs.extend(weekOfYear);
dayjs.extend(advancedFormat);

export const date = (str: string, param?: string): string => {
	// Return empty string as-is without attempting to parse
	if (str === '') {
		return str;
	}

	// If the input is 'now' used in shorthands {{date}} and {{time}}, use the current date and time
	const inputDate = str === 'now' ? new Date() : str;

	if (!param) {
		return dayjs(inputDate).format('YYYY-MM-DD');
	}

	// Remove outer parentheses if present
	param = param.replace(/^\((.*)\)$/, '$1');
	
	// Split by comma, but respect both single and double quoted strings
	const params = param.split(/,(?=(?:(?:[^"']*["'][^"']*["'])*[^"']*$))/).map(p => {
		// Trim whitespace and remove surrounding quotes (both single and double)
		return p.trim().replace(/^(['"])([\s\S]*)\1$/, '$2');
	});

	const [outputFormat, inputFormat] = params;

	let date;
	if (inputFormat) {
		// If inputFormat is provided, use it to parse the date
		date = dayjs(inputDate, inputFormat, true);
	} else {
		// If no inputFormat, let dayjs try to parse it automatically
		date = dayjs(inputDate);
	}

	if (!date.isValid()) {
		console.error('Invalid date for date filter:', str);
		return str;
	}

	return date.format(outputFormat);
};