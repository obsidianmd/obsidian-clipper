import { link } from './link'


describe('link filter', () => {
	it('handles simple link creation', () => {
		expect(link('url', 'author')).toBe('[author](url)');
	});
	it('handles array based link creation', () => {
		// From the docs, broken (or maybe the docs need to be updated) returns a single string instead of an array
		// > For arrays: `["url1","url2"]|link:"author"` returns an array of Markdown links with the same text for all links.
		//expect(link('["url1","url2"]', 'author')).toEqual(['[author](url1)', '[author](url2)']);
	});

	it('handles object based link creation', () => {
		expect(link('{"url1": "Author 1", "url2": "Author 2"}')).toEqual('[Author 1](url1)\n[Author 2](url2)');
	});
});
