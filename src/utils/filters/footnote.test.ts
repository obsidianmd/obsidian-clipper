import { footnote } from './footnote'


describe('footnote filter', () => {
	it('creates footnotes from arrays', () => {
		expect(footnote('["first item","second item"]')).toBe('[^1]: first item\n\n[^2]: second item');
	});
	it('creates footnotes from objects', () => {
		expect(footnote('{"First Note": "Content 1", "Second Note": "Content 2"}')).toBe('[^first-note]: Content 1\n\n[^second-note]: Content 2');
	});
});
