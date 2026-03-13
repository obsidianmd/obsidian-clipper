// Stubs for browser-only modules used in CLI build.
// These are aliased by esbuild so that transitive imports
// of browser-polyfill and storage-utils resolve without error.

export default {} as any;

export const generalSettings: any = {
	propertyTypes: [],
	highlighterEnabled: false,
	highlightBehavior: 'no-highlights',
	silentOpen: false,
	legacyMode: false,
};

export const loadSettings = async () => {};
export const saveSettings = async () => {};
export const incrementStat = async () => {};
export const getLocalStorage = async () => ({});
export const setLocalStorage = async () => {};
