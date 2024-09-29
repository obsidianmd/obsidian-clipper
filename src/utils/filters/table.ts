export const table = (str: string): string => {
	try {
		const data = JSON.parse(str);

		// Function to escape pipe characters in cell content
		const escapeCell = (cell: string) => cell.replace(/\|/g, '\\|');

		// Handle single object
		if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
			const entries = Object.entries(data);
			if (entries.length === 0) return str;

			const [[firstKey, firstValue], ...restEntries] = entries;
			let table = `| ${escapeCell(firstKey)} | ${escapeCell(String(firstValue))} |\n| - | - |\n`;
			
			restEntries.forEach(([key, value]) => {
				table += `| ${escapeCell(key)} | ${escapeCell(String(value))} |\n`;
			});
			return table.trim();
		}

		// Handle array of objects
		if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
			const headers = Object.keys(data[0]);
			let table = `| ${headers.join(' | ')} |\n| ${headers.map(() => '-').join(' | ')} |\n`;
			
			data.forEach(row => {
				table += `| ${headers.map(header => escapeCell(String(row[header] || ''))).join(' | ')} |\n`;
			});

			return table.trim();
		}

		// Handle array of arrays
		if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0])) {
			const maxColumns = Math.max(...data.map(row => row.length));
			let table = `| ${Array(maxColumns).fill('').join(' | ')} |\n| ${Array(maxColumns).fill('-').join(' | ')} |\n`;

			data.forEach(row => {
				const paddedRow = [...row, ...Array(maxColumns - row.length).fill('')];
				table += `| ${paddedRow.map(cell => escapeCell(String(cell))).join(' | ')} |\n`;
			});

			return table.trim();
		}

		// Handle simple array
		if (Array.isArray(data)) {
			let table = "| Value |\n| - |\n";
			data.forEach(item => {
				table += `| ${escapeCell(String(item))} |\n`;
			});

			return table.trim();
		}

		// If none of the above cases match, return the original string
		return str;
	} catch (error) {
		console.error('Error parsing JSON for table filter:', error);
		return str;
	}
};