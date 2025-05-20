import browser from './browser-polyfill';
import { getMessage } from './i18n';

interface Command {
	name: string;
	description: string;
	shortcut: string | null;
}

// Mapping from command name in manifest to message key in messages.json
const commandNameToMessageKey: { [key: string]: string } = {
	// chrome default command
	'_execute_action': 'commandOpenClipper',
	'quick_clip': 'commandQuickClip',
	'toggle_highlighter': 'commandToggleHighlighter',
	'toggle_reader': 'commandToggleReader'
};

export async function getCommands (): Promise<Command[]> {
	const commands = await browser.commands.getAll();
	return commands.map(cmd => ({
		name: cmd.name || '',
		description: getMessage(commandNameToMessageKey[cmd.name || ''] || 'Open clipper'),
		shortcut: cmd.shortcut || null
	}));
}
