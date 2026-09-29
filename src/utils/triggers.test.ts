import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findMatchingTemplate, initializeTriggers } from './triggers';
import { Template } from '../types/types';

const url = 'https://www.imdb.com/title/tt8415836';
const schema = { '@type': 'TVSeries' };
const template = (id: string, trigger: string): Template => ({
	id, name: id, triggers: [trigger], behavior: 'create', properties: [],
	noteNameFormat: '{{title}}', noteContentFormat: '{{content}}', path: '',
});

beforeEach(() => findMatchingTemplate.clear());

describe('template trigger order', () => {
	it.each([
		['schema:@TVSeries', '/^https:\\/\\/www\\.imdb\\.com\\/title\\/tt\\d+/'],
		['schema:@TVSeries', 'https://www.imdb.com/'],
		['/^https:\\/\\/www\\.imdb\\.com\\/title/', 'https://www.imdb.com/'],
		['https://www.imdb.com/', 'https://www.imdb.com/title/'],
	])('prefers earlier %s over later %s', async (earlier, later) => {
		const first = template('first', earlier);
		initializeTriggers([first, template('second', later)]);
		expect(await findMatchingTemplate(url, async () => [schema])).toBe(first);
	});

	it('falls back to the regex when the earlier schema does not match', async () => {
		const fallback = template('fallback', '/^https:\\/\\/www\\.imdb\\.com\\/title/');
		initializeTriggers([template('schema', 'schema:@Movie'), fallback]);
		expect(await findMatchingTemplate(url, async () => [schema])).toBe(fallback);
	});

	it.each(['https://www.imdb.com/', '/^https:\\/\\/www\\.imdb\\.com/'])
	('does not request schema when the earlier %s already matches', async (trigger) => {
		const first = template('first', trigger);
		const getSchema = vi.fn(async () => [schema]);
		initializeTriggers([first, template('schema', 'schema:@TVSeries')]);
		expect(await findMatchingTemplate(url, getSchema)).toBe(first);
		expect(getSchema).not.toHaveBeenCalled();
	});

	it('preserves schema-only matching and the no-match fallback', async () => {
		const first = template('schema', 'schema:@TVSeries');
		initializeTriggers([first]);
		expect(await findMatchingTemplate(url, async () => [schema])).toBe(first);
		expect(await findMatchingTemplate('https://example.com/', async () => [])).toBeUndefined();
	});
});
