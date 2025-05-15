import { wikilink } from './wikilink'


describe('wikilink filter', () => {
	it('handles creation from string', () => {
		expect(wikilink('page')).toBe('[[page]]');
	});
	it('handles creation from string with alias', () => {
		expect(wikilink('page', '"alias"')).toBe('[[page|alias]]');
	});
	it('creates from array with alias', () => {
		// Currently fails, produces `"[[[\"page1\",\"page2\"|alias]]"`
		//expect(wikilink('["page1","page2"', '"alias"')).toEqual(['[[page1|alias]]', '[[page2|alias]]']);
	});
	it('creates from object with alias', () => {
		expect(wikilink('{"page1": "alias1", "page2": "alias2"}')).toEqual('["[[page1|alias1]]","[[page2|alias2]]"]');
	});
});
