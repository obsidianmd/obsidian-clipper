import browser from './browser-polyfill';

/*
Debug modes:
- ContentExtractor
- Filters
- Map
- Markdown
- Template
*/

let debugMode: boolean = false;

// Initialize debug mode from storage
browser.storage.local.get('debugMode').then((result: { debugMode?: boolean }) => {
	debugMode = result.debugMode ?? false;
	console.log(`Debug mode initialized to: ${debugMode ? 'ON' : 'OFF'}`);
}).catch((error) => {
	console.error('Error initializing debug mode:', error);
});

export const toggleDebug = (filterName: string) => {
	debugMode = !debugMode;
	// Save the new state to storage
	browser.storage.local.set({ debugMode }).then(() => {
		console.log(`${filterName} debug mode is now ${debugMode ? 'ON' : 'OFF'}`);
	}).catch((error) => {
		console.error('Error saving debug mode:', error);
	});
};

// Helper function for debug logging
export const debugLog = (filterName: string, ...args: any[]) => {
	if (debugMode) {
		console.log(`[${filterName}]`, ...args);
	}
};

// Function to check if debug mode is on
export const isDebugMode = () => debugMode;

// Expose toggleDebug to the global scope
(window as any).toggleDebug = toggleDebug;