import dayjs from 'dayjs';

export function convertDate(date: Date): string {
	return dayjs(date).format('YYYY-MM-DD');
}