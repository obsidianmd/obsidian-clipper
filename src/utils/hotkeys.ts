interface Command {
	name: string;
	description: string;
	shortcut: string | null;
}

export async function getCommands(): Promise<Command[]> {
	return new Promise((resolve) => {
		chrome.commands.getAll((commands) => {
			resolve(commands.map(cmd => ({
				name: cmd.name || '',
				description: cmd.description || 'Open clipper',
				shortcut: cmd.shortcut || null
			})));
		});
	});
}