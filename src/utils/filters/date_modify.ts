import dayjs from 'dayjs';
import isoWeek from "dayjs/plugin/isoWeek";
import weekOfYear from "dayjs/plugin/weekOfYear";
import customParseFormat from 'dayjs/plugin/customParseFormat';
import advancedFormat from 'dayjs/plugin/advancedFormat';

dayjs.extend(customParseFormat);
dayjs.extend(isoWeek);
dayjs.extend(weekOfYear);
dayjs.extend(advancedFormat);

export const date_modify = (str: string, param?: string): string => {
	if (!param) {
		console.error('date_modify filter requires a parameter');
		return str;
	}

	let date = dayjs(str);
	if (!date.isValid()) {
		console.error('Invalid date for date_modify filter:', str);
		return str;
	}

	// Remove outer parentheses if present
	param = param.replace(/^\((.*)\)$/, '$1');
	
	// Remove any surrounding quotes and trim whitespace
	param = param.replace(/^(['"])(.*)\1$/, '$2').trim();

	// Updated regex to allow for optional spaces and plural units
	const regex = /^([+-])\s*(\d+)\s*(\w+)s?$/;
	const match = param.match(regex);

	if (!match) {
		console.error('Invalid format for date_modify filter:', param);
		return str;
	}

	const [, operation, amount, unit] = match;
	const numericAmount = parseInt(amount, 10);

	if (operation === '+') {
		date = date.add(numericAmount, unit as any);
	} else {
		date = date.subtract(numericAmount, unit as any);
	}

	return date.format('YYYY-MM-DD');
};