export const html_to_json = (input: string): string => {
	const parseNode = (node: Node): any => {
		if (node.nodeType === Node.TEXT_NODE) {
			const text = node.textContent?.trim();
			return text ? { type: 'text', content: text } : null;
		}
		
		if (node.nodeType === Node.ELEMENT_NODE) {
			const element = node as Element;
			const result: any = {
				type: 'element',
				tag: element.tagName.toLowerCase(),
			};
			
			// Get all attributes
			const attributes = Array.from(element.attributes).reduce((acc, attr) => {
				acc[attr.name] = attr.value;
				return acc;
			}, {} as Record<string, string>);
			
			// Only add attributes if there are any
			if (Object.keys(attributes).length > 0) {
				result.attributes = attributes;
			}
			
			const children = Array.from(element.childNodes)
				.map(parseNode)
				.filter(child => child !== null);
			
			if (children.length > 0) {
				result.children = children;
			}
			
			return result;
		}
		
		return null;
	};
	
	try {
		const parser = new DOMParser();
		const doc = parser.parseFromString(input, 'text/html');
		const bodyChildren = Array.from(doc.body.childNodes)
			.map(parseNode)
			.filter(child => child !== null);
		
		// If there's only one top-level element, return it directly
		// Otherwise, return the array of elements
		const result = bodyChildren.length === 1 ? bodyChildren[0] : bodyChildren;
		
		return JSON.stringify(result);
	} catch (error) {
		console.error('Error in html_to_json filter:', error);
		return input;
	}
};