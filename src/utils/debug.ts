import browser from './browser-polyfill';

declare const DEBUG_MODE: boolean;

let debugMode: boolean = DEBUG_MODE;

// Initialize debug mode from storage only in debug mode
if (DEBUG_MODE) {
	browser.storage.local.get('debugMode').then((result: { debugMode?: boolean }) => {
		debugMode = result.debugMode ?? false;
		console.log(`Debug mode initialized to: ${debugMode ? 'ON' : 'OFF'}`);
	}).catch((error) => {
		console.error('Error initializing debug mode:', error);
	});
}

export const toggleDebug = (filterName: string) => {
	if (!DEBUG_MODE) return;
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
	if (DEBUG_MODE && debugMode) {
		console.log(`[${filterName}]`, ...args);
	}
};

// Function to check if debug mode is on
export const isDebugMode = () => DEBUG_MODE && debugMode;

// Expose toggleDebug to the global scope only in debug mode
if (DEBUG_MODE) {
	(window as any).toggleDebug = toggleDebug;
}