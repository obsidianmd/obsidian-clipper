type ListType = 'bullet' | 'numbered' | 'task' | 'numbered-task';

export const list = (input: string | any[], param?: string): string => {
	const processListItem = (item: any, type: ListType, depth: number = 0): string => {
		const indent = '\t'.repeat(depth);
		let prefix: string;
		switch (type) {
			case 'numbered':
				prefix = '1. ';
				break;
			case 'task':
				prefix = '- [ ] ';
				break;
			case 'numbered-task':
				prefix = '1. [ ] ';
				break;
			default:
				prefix = '- ';
		}
		
		if (Array.isArray(item)) {
			return processArray(item, type, depth + 1);
		}
		return `${indent}${prefix}${item}`;
	};

	const processArray = (arr: any[], type: ListType, depth: number = 0): string => {
		return arr.map((item, index) => {
			let itemType = type;
			if (type === 'numbered' || type === 'numbered-task') {
				const number = index + 1;
				return processListItem(item, itemType, depth).replace(/^\d+/, number.toString());
			}
			return processListItem(item, itemType, depth);
		}).join('\n');
	};

	const determineListType = (param?: string): ListType => {
		switch (param) {
			case 'numbered':
				return 'numbered';
			case 'task':
				return 'task';
			case 'numbered-task':
				return 'numbered-task';
			default:
				return 'bullet';
		}
	};

	try {
		const parsedInput = typeof input === 'string' ? JSON.parse(input) : input;
		if (Array.isArray(parsedInput)) {
			const listType = determineListType(param);
			return processArray(parsedInput, listType);
		}
		// If it's an object or a single value, wrap it in an array
		return processArray([parsedInput], determineListType(param));
	} catch (error) {
		console.error('Error processing list filter:', error);
		// If parsing fails, treat it as a single string
		return processListItem(input, determineListType(param));
	}
};