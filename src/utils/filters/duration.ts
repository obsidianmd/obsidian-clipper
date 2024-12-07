import dayjs from 'dayjs';
import durationPlugin from 'dayjs/plugin/duration';
import { Duration } from 'dayjs/plugin/duration';

dayjs.extend(durationPlugin);

export const duration = (str: string, param?: string): string => {
	if (!str) {
		return str;
	}

	try {
		// Remove outer quotes if present
		str = str.replace(/^["'](.*)["']$/, '$1');

		// Parse ISO 8601 duration string
		const matches = str.match(/^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
		if (!matches) {
			// Try parsing as seconds if it's just a number
			const seconds = parseInt(str, 10);
			if (!isNaN(seconds)) {
				return formatDuration(dayjs.duration(seconds, 'seconds'), param);
			}
			return str;
		}

		const [, years, months, days, hours, minutes, seconds] = matches;
		
		const dur = dayjs.duration({
			years: years ? parseInt(years) : 0,
			months: months ? parseInt(months) : 0,
			days: days ? parseInt(days) : 0,
			hours: hours ? parseInt(hours) : 0,
			minutes: minutes ? parseInt(minutes) : 0,
			seconds: seconds ? parseInt(seconds) : 0
		});

		return formatDuration(dur, param);
	} catch (error) {
		console.error('Error in duration filter:', error);
		return str;
	}
};

function formatDuration(dur: Duration, format?: string): string {
	if (!format) {
		// Default format based on duration length
		if (dur.asHours() >= 1) {
			format = 'HH:mm:ss';
		} else {
			format = 'mm:ss';
		}
	}

	// Remove outer quotes and parentheses if present
	format = format.replace(/^["'(](.*)["')]$/, '$1');

	const hours = Math.floor(dur.asHours());
	const minutes = dur.minutes();
	const seconds = dur.seconds();

	const parts: { [key: string]: string | number } = {
		'HH': padZero(hours),
		'H': hours.toString(),
		'mm': padZero(minutes),
		'm': minutes.toString(),
		'ss': padZero(seconds),
		's': seconds.toString()
	};

	return format.replace(/HH|H|mm|m|ss|s/g, match => parts[match].toString());
}

function padZero(num: number): string {
	return num.toString().padStart(2, '0');
} 