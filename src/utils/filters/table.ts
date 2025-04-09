export const table = (str: string, params?: string): string => {
	// Handle empty or invalid input
	if (!str || str === 'undefined' || str === 'null') {
		return str;
	}

	try {
		const data = JSON.parse(str);
		let customHeaders: string[] = [];

		// Parse custom headers from params if provided
		if (params) {
			try {
				// Remove outer parentheses if present and split by comma
				const headerStr = params.replace(/^\((.*)\)$/, '$1');
				customHeaders = headerStr.split(',').map(header => 
					header.trim().replace(/^["'](.*)["']$/, '$1')
				);
			} catch (error) {
				console.error('Error parsing table headers:', error);
			}
		}

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
			const headers = customHeaders.length > 0 ? customHeaders : Object.keys(data[0]);
			let table = `| ${headers.join(' | ')} |\n| ${headers.map(() => '-').join(' | ')} |\n`;
			
			data.forEach(row => {
				table += `| ${headers.map(header => escapeCell(String(row[header] || ''))).join(' | ')} |\n`;
			});

			return table.trim();
		}

		// Handle array of arrays
		if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0])) {
			const maxColumns = Math.max(...data.map(row => row.length));
			const headers = customHeaders.length > 0 ? customHeaders : Array(maxColumns).fill('');
			let table = `| ${headers.join(' | ')} |\n| ${headers.map(() => '-').join(' | ')} |\n`;

			data.forEach(row => {
				const paddedRow = [...row, ...Array(maxColumns - row.length).fill('')];
				table += `| ${paddedRow.map(cell => escapeCell(String(cell))).join(' | ')} |\n`;
			});

			return table.trim();
		}

		// Handle simple array with custom headers
		if (Array.isArray(data)) {
			if (customHeaders.length > 0) {
				const numColumns = customHeaders.length;
				let table = `| ${customHeaders.join(' | ')} |\n| ${customHeaders.map(() => '-').join(' | ')} |\n`;
				
				// Break the array into rows based on the number of columns
				for (let i = 0; i < data.length; i += numColumns) {
					const row = data.slice(i, i + numColumns);
					// Pad the row with empty strings if needed
					const paddedRow = [...row, ...Array(numColumns - row.length).fill('')];
					table += `| ${paddedRow.map(cell => escapeCell(String(cell))).join(' | ')} |\n`;
				}
				return table.trim();
			}

			// Default single column table if no headers provided
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