import { describe, test, expect } from 'vitest';
import { isRTLLanguage } from './i18n';

// The reading view derives its text direction from the article language via
// isRTLLanguage (see Reader.apply / updateReaderContent), so the RTL language
// set is part of the reader's contract. (#864)
describe('isRTLLanguage', () => {
	test('detects right-to-left languages', () => {
		for (const code of ['ar', 'fa', 'he', 'ur', 'ps', 'sd', 'dv', 'yi', 'ckb', 'syr']) {
			expect(isRTLLanguage(code)).toBe(true);
		}
	});

	test('normalizes case and ignores region subtags', () => {
		expect(isRTLLanguage('AR')).toBe(true);
		expect(isRTLLanguage('ar-EG')).toBe(true);
		expect(isRTLLanguage('fa-IR')).toBe(true);
		expect(isRTLLanguage('he-IL')).toBe(true);
	});

	test('treats left-to-right and unknown languages as non-RTL', () => {
		for (const code of ['en', 'en-US', 'fr', 'de', 'es', 'ja', 'zh', 'ru', 'tr', '']) {
			expect(isRTLLanguage(code)).toBe(false);
		}
	});
});
