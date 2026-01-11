import type { ParamValidationResult } from '../filters';

export const validateNthParams = (param: string | undefined): ParamValidationResult => {
	// Param is optional - no param means return all items
	if (!param) {
		return { valid: true };
	}

	// Check for basis pattern (e.g., "1,2,3:7")
	if (param.includes(':')) {
		const [positions, basis] = param.split(':').map(p => p.trim());
		const nthValues = positions.split(',').map(n => parseInt(n.trim(), 10));
		const basisSize = parseInt(basis, 10);

		if (nthValues.some(n => isNaN(n) || n < 1)) {
			return { valid: false, error: 'positions must be positive numbers (e.g., nth:1,2,3:7)' };
		}
		if (isNaN(basisSize) || basisSize < 1) {
			return { valid: false, error: 'basis must be a positive number (e.g., nth:1,2,3:7)' };
		}
		return { valid: true };
	}

	const expr = param.trim();

	// Simple number (e.g., "7")
	if (/^\d+$/.test(expr)) {
		return { valid: true };
	}

	// "n" multiplier (e.g., "5n")
	if (/^\d+n$/.test(expr)) {
		return { valid: true };
	}

	// "n+b" format (e.g., "n+7")
	if (/^n\+\d+$/.test(expr)) {
		return { valid: true };
	}

	return { valid: false, error: 'invalid syntax. Use number (2), multiplier (5n), offset (n+7), or basis (1,2:5)' };
};

export const nth = (str: string, params?: string): string => {
	// Handle empty or invalid input
	if (!str || str === 'undefined' || str === 'null') {
		return str;
	}

	try {
		const data = JSON.parse(str);
		if (!Array.isArray(data)) {
			return str;
		}

		// Default to keeping every item if no params
		if (!params) {
			return JSON.stringify(data);
		}

		// Check if we have a basis pattern (e.g., "1,2,3:7")
		if (params.includes(':')) {
			const [positions, basis] = params.split(':').map(p => p.trim());
			const nthValues = positions.split(',').map(n => parseInt(n.trim(), 10))
				.filter(n => !isNaN(n) && n > 0);
			const basisSize = parseInt(basis, 10);

			return JSON.stringify(data.filter((_, index) => {
				const positionInGroup = (index % basisSize) + 1;
				return nthValues.includes(positionInGroup);
			}));
		}

		// Parse CSS-style nth expressions
		const nthExpression = params.trim();

		// Handle simple number (e.g., "7")
		if (/^\d+$/.test(nthExpression)) {
			const position = parseInt(nthExpression, 10);
			return JSON.stringify(data.filter((_, index) => index + 1 === position));
		}

		// Handle "n" multiplier (e.g., "5n")
		if (/^\d+n$/.test(nthExpression)) {
			const multiplier = parseInt(nthExpression, 10);
			return JSON.stringify(data.filter((_, index) => {
				const position = index + 1;
				return position % multiplier === 0;
			}));
		}

		// Handle "n+b" format (e.g., "n+7")
		const nPlusBMatch = nthExpression.match(/^n\+(\d+)$/);
		if (nPlusBMatch) {
			const offset = parseInt(nPlusBMatch[1], 10);
			return JSON.stringify(data.filter((_, index) => {
				const position = index + 1;
				return position >= offset;
			}));
		}

		// Invalid syntax
		console.error('Invalid nth filter syntax:', params);
		return str;

	} catch (error) {
		console.error('Error in nth filter:', error);
		return str;
	}
}; 