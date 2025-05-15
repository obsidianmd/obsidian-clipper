import { table } from './table'


describe('table filter', () => {
    it('can convert an array of objects', () => {
        expect(table('[{"h1": "one", "h2":"two"}, {"h1":"1", "h2":"2"}]')).toBe('| h1 | h2 |\n| - | - |\n| one | two |\n| 1 | 2 |')
    });
    it('can convert an array of arrays', () => {
        //For an array of arrays, it creates a table with each nested array as a row.
        expect(table('[["one", "two"], ["1", "2"]]')).toBe('| 0 | 1 |\n| - | - |\n| one | two |\n| 1 | 2 |')
    });
    it('can convert a simple array', () => {
        expect(table('["one", "two", "three"]')).toBe('| Value |\n| - |\n| one |\n| two |\n| three |');
    });
    it('can convert an array with headers', () => {
        expect(table('["one", "two", "three", "four"]', '("Column 1", "Column 2")')).toBe('| Column 1 | Column 2 |\n| - | - |\n| one | two |\n| three | four |');
    });
});
