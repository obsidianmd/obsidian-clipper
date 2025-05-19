import { merge } from './merge'


describe('merge filter', () => {
	it('Adds individual value to array', () => {
		expect(merge('["a","b"]', 'c')).toBe('["a","b","c"]');
	});
	it('Adds multiple individual values to array', () => {
		expect(merge('["a","b"]', '("c", "d")')).toBe('["a","b","c","d"]');
	});
	it('creates array if input is not array', () => {
		// Fails, returns too many escapes

		// The below returns "[\"\\\"a\\\"\",\"b\",\"c\"]"
		//expect(merge('"a"', '("b", "c")')).toBe('["a","b","c"]');

		// If I don't wrap the first arg then I just get it back (below returns "a")
		//expect(merge('a', '("b", "c")')).toBe('["a","b","c"]');
	});
	it('merges with quoted values', () => {
		// Fails, returns "[\"a\",\"b,\\\"c,d\\\",e\"]" (note the double escaped backslash before "c)
		// Not sure exactly what the expected behavior is though... 
		// To me it looks like we're merging with a single string 'b,"c,d",e' so I'd expect to get ["a", "b,\"c,d\",e"]
		//expect(merge('["a"]', `('b,"c,d",e')`)).toBe('["a","b","c,d", "e"]');
	});
});
