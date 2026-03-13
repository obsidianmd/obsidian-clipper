import { sanitizeFileName } from './string-utils';

/**
 * Open a note in Obsidian via URI scheme.
 */
export async function openInObsidian(
	fileContent: string,
	noteName: string,
	path: string,
	vault: string,
	behavior: string,
	silent: boolean
): Promise<void> {
	const { exec } = await import('child_process');
	const { promisify } = await import('util');
	const execAsync = promisify(exec);

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
	let command: string;
	if (platform === 'darwin') {
		command = `open "${obsidianUrl}"`;
	} else if (platform === 'win32') {
		command = `start "" "${obsidianUrl}"`;
	} else {
		command = `xdg-open "${obsidianUrl}"`;
	}

	await execAsync(command);
}
