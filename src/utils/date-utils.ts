import dayjs from 'dayjs';
import advancedFormat from 'dayjs/plugin/advancedFormat';

dayjs.extend(advancedFormat);

export function convertDate(date: Date, format: string = 'YYYY-MM-DD'): string {
	return dayjs(date).format(format);
}