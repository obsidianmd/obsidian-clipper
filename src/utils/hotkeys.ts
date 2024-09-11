import browser from './browser-polyfill';

interface Command {
	name: string;
	description: string;
	shortcut: string | null;
}

export async function getCommands(): Promise<Command[]> {
	const commands = await browser.commands.getAll();
	return commands.map(cmd => ({
		name: cmd.name || '',
		description: cmd.description || 'Open clipper',
		shortcut: cmd.shortcut || null
	}));
}