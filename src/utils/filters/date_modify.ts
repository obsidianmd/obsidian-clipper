import dayjs from 'dayjs';
import isoWeek from "dayjs/plugin/isoWeek";
import weekOfYear from "dayjs/plugin/weekOfYear";
import customParseFormat from 'dayjs/plugin/customParseFormat';
import advancedFormat from 'dayjs/plugin/advancedFormat';
import type { ParamValidationResult } from '../filters';

dayjs.extend(customParseFormat);
dayjs.extend(isoWeek);
dayjs.extend(weekOfYear);
dayjs.extend(advancedFormat);

const validUnits = ['year', 'years', 'month', 'months', 'week', 'weeks', 'day', 'days', 'hour', 'hours', 'minute', 'minutes', 'second', 'seconds'];

export const validateDateModifyParams = (param: string | undefined): ParamValidationResult => {
	if (!param) {
		return { valid: false, error: 'requires a modifier (e.g., date_modify:"+1 day", "-2 weeks")' };
	}

	// Remove outer parentheses and quotes if present
	let cleanParam = param.replace(/^\((.*)\)$/, '$1');
	cleanParam = cleanParam.replace(/^(['"])([\s\S]*)\1$/, '$2').trim();

	const regex = /^([+-])\s*(\d+)\s*(\w+)s?$/;
	const match = cleanParam.match(regex);

	if (!match) {
		return { valid: false, error: 'invalid format. Use "+1 day", "-2 weeks", etc.' };
	}

	const [, , , unit] = match;
	const normalizedUnit = unit.toLowerCase().replace(/s$/, '');

	if (!validUnits.some(u => u.replace(/s$/, '') === normalizedUnit)) {
		return { valid: false, error: `invalid unit "${unit}". Use year, month, week, day, hour, minute, or second` };
	}

	return { valid: true };
};

export const date_modify = (str: string, param?: string): string => {
	if (!param) {
		console.error('date_modify filter requires a parameter');
		return str;
	}

	// Return empty string as-is without attempting to parse
	if (str === '') {
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
	param = param.replace(/^(['"])([\s\S]*)\1$/, '$2').trim();

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