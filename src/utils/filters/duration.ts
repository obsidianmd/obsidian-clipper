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
		str = str.replace(/^["'](.*)["']$/g, '$1');

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
		
		// Convert all components to total seconds to ensure proper normalization
		// Using dayjs.duration({ seconds: 1868 }) does NOT normalize (keeps 1868 in seconds field)
		// Using dayjs.duration(1868, 'seconds') DOES normalize (converts to 31m 8s)
		const totalSeconds = 
			(years ? parseInt(years) * 365 * 24 * 3600 : 0) +
			(months ? parseInt(months) * 30 * 24 * 3600 : 0) +
			(days ? parseInt(days) * 24 * 3600 : 0) +
			(hours ? parseInt(hours) * 3600 : 0) +
			(minutes ? parseInt(minutes) * 60 : 0) +
			(seconds ? parseInt(seconds) : 0);

		const dur = dayjs.duration(totalSeconds, 'seconds');

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
	format = format.replace(/^["'(](.*)["')]$/g, '$1');

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
