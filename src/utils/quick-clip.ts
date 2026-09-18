import { SaveBehavior } from '../types/types';

type MaybePromise<T> = T | Promise<T>;

export interface QuickClipHandlers {
	addToObsidian: () => MaybePromise<void>;
	saveFile: () => MaybePromise<void>;
	copyToClipboard: () => MaybePromise<void>;
}

interface QuickClipOptions {
	waitUntilReady: () => Promise<void>;
	getSaveBehavior: () => SaveBehavior | undefined;
	handlers: QuickClipHandlers;
}

export async function runQuickClip(options: QuickClipOptions): Promise<void> {
	await options.waitUntilReady();

	switch (options.getSaveBehavior()) {
		case 'saveFile':
			await options.handlers.saveFile();
			break;
		case 'copyToClipboard':
			await options.handlers.copyToClipboard();
			break;
		case 'addToObsidian':
		default:
			await options.handlers.addToObsidian();
			break;
	}
}
