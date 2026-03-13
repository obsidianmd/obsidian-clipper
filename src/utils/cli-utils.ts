import { sanitizeFileName } from './string-utils';
import { Template } from '../types/types';

/**
 * Open a note in Obsidian via URI scheme.
 */
export async function openInObsidian(
	fileContent: string,
	noteName: string,
	path: string,
	vault: string,
	behavior: Template['behavior'],
	silent: boolean
): Promise<void> {
	const { execFile } = await import('child_process');
	const { promisify } = await import('util');
	const execFileAsync = promisify(execFile);

	const isDailyNote = behavior === 'append-daily' || behavior === 'prepend-daily';

	let obsidianUrl: string;
	if (isDailyNote) {
		obsidianUrl = `obsidian://daily?`;
	} else {
		if (path && !path.endsWith('/')) {
			path += '/';
		}
		const formattedNoteName = sanitizeFileName(noteName);
		obsidianUrl = `obsidian://new?file=${encodeURIComponent(path + formattedNoteName)}`;
	}

	if (behavior.startsWith('append')) {
		obsidianUrl += '&append=true';
	} else if (behavior.startsWith('prepend')) {
		obsidianUrl += '&prepend=true';
	} else if (behavior === 'overwrite') {
		obsidianUrl += '&overwrite=true';
	}

	if (vault) {
		obsidianUrl += `&vault=${encodeURIComponent(vault)}`;
	}

	if (silent) {
		obsidianUrl += '&silent=true';
	}

	obsidianUrl += `&content=${encodeURIComponent(fileContent)}`;

	const platform = process.platform;
	if (platform === 'darwin') {
		await execFileAsync('open', [obsidianUrl]);
	} else if (platform === 'win32') {
		await execFileAsync('cmd', ['/c', 'start', '', obsidianUrl]);
	} else {
		await execFileAsync('xdg-open', [obsidianUrl]);
	}
}
