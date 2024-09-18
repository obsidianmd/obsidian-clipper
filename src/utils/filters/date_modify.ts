import dayjs from 'dayjs';
import advancedFormat from 'dayjs/plugin/advancedFormat';

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

	// Remove any surrounding quotes and trim whitespace
	param = param.replace(/^["']|["']$/g, '').trim();

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

	// Use 'YYYY-MM-DD' as default format, but allow for custom format
	const format = param.split(',')[1]?.trim() || 'YYYY-MM-DD';
	return date.format(format);
};