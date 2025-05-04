import { object } from './object'

const abObject = '{"a":1,"b":2}'

describe('object filter', () => {
	it('converts an object to an array of key-value pairs', () => {
		expect(object(abObject, 'array')).toBe('[["a",1],["b",2]]');
	});
	it('returns array of object\'s keys', () => {
		expect(object(abObject, 'keys')).toBe('["a","b"]');
	});
	it('returns array of object\'s values', () => {
		expect(object(abObject, 'values')).toBe('[1,2]');
	});
});
