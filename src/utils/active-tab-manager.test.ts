import { describe, test, expect } from 'vitest';
import { isValidUrl, isBlankPage, isRestrictedUrl } from './active-tab-manager';

describe('isValidUrl', () => {
	test('returns true for http URLs', () => {
		expect(isValidUrl('http://example.com')).toBe(true);
	});

	test('returns true for https URLs', () => {
		expect(isValidUrl('https://example.com')).toBe(true);
	});

	test('returns true for file URLs', () => {
		expect(isValidUrl('file:///path/to/file.html')).toBe(true);
	});

	test('returns false for about: URLs', () => {
		expect(isValidUrl('about:blank')).toBe(false);
	});

	test('returns false for chrome: URLs', () => {
		expect(isValidUrl('chrome://extensions')).toBe(false);
	});
});

describe('isBlankPage', () => {
	test('returns true for about:blank', () => {
		expect(isBlankPage('about:blank')).toBe(true);
	});

	test('returns true for chrome://newtab/', () => {
		expect(isBlankPage('chrome://newtab/')).toBe(true);
	});

	test('returns true for edge://newtab/', () => {
		expect(isBlankPage('edge://newtab/')).toBe(true);
	});

	test('returns false for regular URLs', () => {
		expect(isBlankPage('https://example.com')).toBe(false);
	});
});

describe('isRestrictedUrl', () => {
	// Firefox addon store
	test('returns true for addons.mozilla.org', () => {
		expect(isRestrictedUrl('https://addons.mozilla.org')).toBe(true);
		expect(isRestrictedUrl('https://addons.mozilla.org/en-US/firefox/addon/some-addon/')).toBe(true);
	});

	// Chrome Web Store
	test('returns true for Chrome Web Store URLs', () => {
		expect(isRestrictedUrl('https://chrome.google.com/webstore')).toBe(true);
		expect(isRestrictedUrl('https://chrome.google.com/webstore/detail/some-extension/abc123')).toBe(true);
		expect(isRestrictedUrl('https://chromewebstore.google.com')).toBe(true);
		expect(isRestrictedUrl('https://chromewebstore.google.com/detail/some-extension/abc123')).toBe(true);
	});

	// Edge Add-ons
	test('returns true for Edge Add-ons URLs', () => {
		expect(isRestrictedUrl('https://microsoftedge.microsoft.com/addons')).toBe(true);
		expect(isRestrictedUrl('https://microsoftedge.microsoft.com/addons/detail/some-extension/abc123')).toBe(true);
	});

	// Non-restricted URLs
	test('returns false for regular URLs', () => {
		expect(isRestrictedUrl('https://example.com')).toBe(false);
		expect(isRestrictedUrl('https://google.com')).toBe(false);
		expect(isRestrictedUrl('https://mozilla.org')).toBe(false);
	});

	// Edge cases
	test('returns false for similar but non-restricted URLs', () => {
		// chrome.google.com but not /webstore
		expect(isRestrictedUrl('https://chrome.google.com/intl/en/chrome/')).toBe(false);
		// microsoftedge.microsoft.com but not /addons
		expect(isRestrictedUrl('https://microsoftedge.microsoft.com/')).toBe(false);
	});

	test('handles invalid URLs gracefully', () => {
		expect(isRestrictedUrl('')).toBe(false);
		expect(isRestrictedUrl('not-a-url')).toBe(false);
	});
});
