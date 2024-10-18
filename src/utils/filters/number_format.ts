export const number_format = (input: string, param?: string): string => {
	const formatNumber = (num: number, decimals: number, decPoint: string, thousandsSep: string): string => {
		const parts = num.toFixed(decimals).split('.');
		parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSep);
		return parts.join(decPoint);
	};

	const processValue = (value: any, decimals: number, decPoint: string, thousandsSep: string): any => {
		if (typeof value === 'number' || (typeof value === 'string' && !isNaN(parseFloat(value)))) {
			const num = typeof value === 'string' ? parseFloat(value) : value;
			return formatNumber(num, decimals, decPoint, thousandsSep);
		} else if (Array.isArray(value)) {
			return value.map(item => processValue(item, decimals, decPoint, thousandsSep));
		} else if (typeof value === 'object' && value !== null) {
			const result: {[key: string]: any} = {};
			for (const [key, val] of Object.entries(value)) {
				result[key] = processValue(val, decimals, decPoint, thousandsSep);
			}
			return result;
		}
		return value;
	};

	const unescapeString = (str: string): string => {
		return str.replace(/\\(.)/g, '$1');
	};

	try {
		let decimals = 0;
		let decPoint = '.';
		let thousandsSep = ',';

		if (param) {
			// Remove outer parentheses if present
			const cleanParam = param.replace(/^\((.*)\)$/, '$1');
			
			// Split parameters, respecting quotes and escapes
			const params: string[] = [];
			let current = '';
			let inQuote = false;
			let escapeNext = false;

			for (let i = 0; i < cleanParam.length; i++) {
				const char = cleanParam[i];
				if (escapeNext) {
					current += char;
					escapeNext = false;
				} else if (char === '\\') {
					current += char;
					escapeNext = true;
				} else if (char === '"' && !inQuote) {
					inQuote = true;
				} else if (char === '"' && inQuote) {
					inQuote = false;
				} else if (char === ',' && !inQuote) {
					params.push(current.trim());
					current = '';
				} else {
					current += char;
				}
			}
			if (current) {
				params.push(current.trim());
			}

			if (params.length >= 1) decimals = parseInt(params[0], 10);
			if (params.length >= 2) decPoint = unescapeString(params[1].replace(/^["'](.*)["']$/, '$1'));
			if (params.length >= 3) thousandsSep = unescapeString(params[2].replace(/^["'](.*)["']$/, '$1'));
		}

		if (isNaN(decimals)) decimals = 0;

		let parsedInput: any;
		try {
			parsedInput = JSON.parse(input);
		} catch {
			// If JSON parsing fails, treat input as a single value
			parsedInput = input;
		}

		const result = processValue(parsedInput, decimals, decPoint, thousandsSep);
		return typeof result === 'string' ? result : JSON.stringify(result);
	} catch (error) {
		console.error('Error in number_format filter:', error);
		return input; // Return original input if any unexpected error occurs
	}
};
