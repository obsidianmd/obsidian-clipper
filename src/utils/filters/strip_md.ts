export const strip_md = (str: string): string => {
		// Remove images first
		str = str.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '');
		str = str.replace(/!\[\[([^\]]+)\]\]/g, '');

		// Remove links, but keep the text
		str = str.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');

		// Remove any remaining URL-like strings
		str = str.replace(/https?:\/\/\S+/g, '');

		// Rest of the replacements
		str = str.replace(/(\*\*|__)(.*?)\1/g, '$2');  // bold
		str = str.replace(/(\*|_)(.*?)\1/g, '$2');  // italic
		str = str.replace(/==(.*?)==/g, '$1');  // highlights
		str = str.replace(/^#+\s+/gm, '');  // headers
		str = str.replace(/`([^`]+)`/g, '$1');  // inline code
		str = str.replace(/```[\s\S]*?```/g, '');  // code blocks
		str = str.replace(/~~(.*?)~~/g, '$1');  // strikethrough
		str = str.replace(/^[-*+] (\[[x ]\] )?/gm, '');  // task lists and list items
		str = str.replace(/^([-*_]){3,}\s*$/gm, '');  // horizontal rules
		str = str.replace(/^>\s+/gm, '');  // blockquotes
		str = str.replace(/\|.*\|/g, '');  // tables (removed entirely)
		str = str.replace(/([~^])(\w+)\1/g, '$2');  // subscript and superscript
		str = str.replace(/:[a-z_]+:/g, '');  // emoji shortcodes
		str = str.replace(/<[^>]+>/g, '');  // HTML tags
		str = str.replace(/\[\s*\]/g, '');  // empty square brackets
		str = str.replace(/\[\^[^\]]+\]/g, '');  // footnote references
		str = str.replace(/^\*\[[^\]]+\]:.+$/gm, '');  // abbreviations
		str = str.replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (match, p1, p2) => p2 || p1);  // wikilinks

		// Final cleanup
		str = str.replace(/\n{3,}/g, '\n\n');  // Multiple newlines
		str = str.trim();  // Trim whitespace

		return str;
};
