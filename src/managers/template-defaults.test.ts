import { describe, test, expect } from 'vitest';
import { DEFAULT_TEMPLATE_PATH } from './template-defaults';
import { compileTemplate } from '../utils/template-compiler';

function compilePath(domain: string) {
	return compileTemplate(0, DEFAULT_TEMPLATE_PATH, { '{{domain}}': domain }, `https://${domain}/article`);
}

describe('DEFAULT_TEMPLATE_PATH', () => {
	test('files a clipping under the site name', async () => {
		expect(await compilePath('mp.weixin.qq.com')).toBe('Clippings/qq');
		expect(await compilePath('news.ycombinator.com')).toBe('Clippings/ycombinator');
		expect(await compilePath('github.com')).toBe('Clippings/github');
	});

	test('keeps the site name for a two-part country suffix', async () => {
		expect(await compilePath('www.bbc.co.uk')).toBe('Clippings/bbc');
	});

	test('falls back to the bare folder when no domain is available', async () => {
		expect(await compilePath('')).toBe('Clippings/');
	});
});
