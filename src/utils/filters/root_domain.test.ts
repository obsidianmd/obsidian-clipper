import { describe, test, expect } from 'vitest';
import { root_domain } from './root_domain';

describe('root_domain filter', () => {
	test('leaves a bare registrable domain untouched', () => {
		expect(root_domain('github.com')).toBe('github.com');
	});

	test('strips a subdomain', () => {
		expect(root_domain('news.ycombinator.com')).toBe('ycombinator.com');
	});

	test('strips several subdomain levels', () => {
		expect(root_domain('a.b.c.example.com')).toBe('example.com');
	});

	test('keeps a two-part country suffix', () => {
		expect(root_domain('www.bbc.co.uk')).toBe('bbc.co.uk');
		expect(root_domain('example.com.au')).toBe('example.com.au');
		expect(root_domain('blog.example.co.jp')).toBe('example.co.jp');
	});

	test('does not over-trim a country TLD without a known second level', () => {
		expect(root_domain('example.de')).toBe('example.de');
		expect(root_domain('www.example.de')).toBe('example.de');
	});

	test('accepts a full URL', () => {
		expect(root_domain('https://news.ycombinator.com/item?id=1')).toBe('ycombinator.com');
		expect(root_domain('http://www.bbc.co.uk/news')).toBe('bbc.co.uk');
	});

	test('returns hosts without a dot unchanged', () => {
		expect(root_domain('localhost')).toBe('localhost');
	});

	test('ignores port and trailing dot', () => {
		expect(root_domain('www.example.com:8080')).toBe('example.com');
		expect(root_domain('www.example.com.')).toBe('example.com');
	});

	test('leaves an IPv4 address alone', () => {
		expect(root_domain('192.168.1.10')).toBe('192.168.1.10');
	});

	test('lowercases the result', () => {
		expect(root_domain('WWW.Example.COM')).toBe('example.com');
	});

	test('returns empty input unchanged', () => {
		expect(root_domain('')).toBe('');
	});
});
