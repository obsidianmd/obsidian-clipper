// Stubs for browser-only modules used in CLI build.
// These are aliased by esbuild so that transitive imports
// of browser-polyfill and storage-utils resolve without error.

import type { Settings } from '../types/types';

export default {} as any;

export const generalSettings: Settings = {
	vaults: [],
	betaFeatures: false,
	legacyMode: false,
	silentOpen: false,
	openBehavior: 'popup',
	highlighterEnabled: false,
	alwaysShowHighlights: false,
	highlightBehavior: 'no-highlights',
	showMoreActionsButton: false,
	interpreterModel: '',
	models: [],
	providers: [],
	interpreterEnabled: false,
	interpreterAutoRun: false,
	defaultPromptContext: '',
	propertyTypes: [],
	readerSettings: {
		fontSize: 16,
		lineHeight: 1.5,
		maxWidth: 700,
		lightTheme: 'default',
		darkTheme: 'same',
		appearance: 'auto',
		fonts: [],
		defaultFont: '',
		blendImages: true,
		colorLinks: false,
		pinPlayer: true,
		autoScroll: true,
		highlightActiveLine: true,
		customCss: '',
	},
	stats: {
		addToObsidian: 0,
		saveFile: 0,
		copyToClipboard: 0,
		share: 0,
	},
	history: [],
	ratings: [],
	saveBehavior: 'addToObsidian',
};

export const loadSettings = async () => {};
export const saveSettings = async () => {};
export const incrementStat = async () => {};
export const getLocalStorage = async () => ({});
export const setLocalStorage = async () => {};
