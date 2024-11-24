export const calc = (str: string, param?: string): string => {
	if (!param) {
		return str;
	}

	try {
		// Convert input to number
		const num = Number(str);
		if (isNaN(num)) {
			console.error('Input is not a number:', str);
			return str;
		}

		// Remove outer quotes if present
		const operation = param.replace(/^['"](.*)['"]$/, '$1').trim();

		// Parse the operation
		const operator = operation.slice(0, 2) === '**' ? '**' : operation.charAt(0);
		const value = Number(operation.slice(operator === '**' ? 2 : 1));
		
		if (isNaN(value)) {
			console.error('Invalid calculation value:', operation);
			return str;
		}

		let result: number;
		switch (operator) {
			case '+':
				result = num + value;
				break;
			case '-':
				result = num - value;
				break;
			case '*':
				result = num * value;
				break;
			case '/':
				result = num / value;
				break;
			case '**':
			case '^':
				result = Math.pow(num, value);
				break;
			default:
				console.error('Invalid operator:', operator);
				return str;
		}

		// Convert to string and remove trailing zeros after decimal
		return Number(result.toFixed(10)).toString();
	} catch (error) {
		console.error('Error in calc filter:', error);
		return str;
	}
}; 