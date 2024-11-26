import { generalSettings } from '../storage-utils';

// This function doesn't really do anything, it just returns the whole prompt variable
// so that it's still visible in the input fields in the popup
export async function processPrompt(match: string, variables: { [key: string]: string }, currentUrl: string): Promise<string> {
	if (generalSettings.interpreterEnabled) {
		const promptRegex = /{{(?:prompt:)?"(.*?)"(\|.*?)?}}/;
		const matches = match.match(promptRegex);
		if (!matches) {
			console.error('Invalid prompt format:', match);
			return match;
		}
	
		const [, promptText, filters = ''] = matches;
	
		return match;
	} else {
		return '';
	}
}
