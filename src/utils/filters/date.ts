import dayjs from 'dayjs';

export const date = (str: string, format?: string): string => {
	const date = dayjs(str);
	if (!date.isValid()) {
		console.error('Invalid date for date filter:', str);
		return str;
	}
	return format ? date.format(format) : date.format();
};