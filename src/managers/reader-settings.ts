import { saveSettings, generalSettings } from '../utils/storage-utils';

export function initializeReaderSettings() {
	const form = document.getElementById('reader-settings-form');
	if (!form) return;

	// Set initial values
	const inputs = form.querySelectorAll('select');
	inputs.forEach(input => {
		switch (input.id) {
			case 'reader-font-family':
				input.value = generalSettings.readerSettings.fontFamily;
				break;
			case 'reader-theme':
				input.value = generalSettings.readerSettings.theme;
				break;
		}
	});

	// Add event listeners
	inputs.forEach(input => {
		input.addEventListener('input', (e) => {
			const target = e.target as HTMLSelectElement;
			
			// Update settings based on input id
			switch (target.id) {
				case 'reader-font-family':
					generalSettings.readerSettings.fontFamily = target.value;
					break;
				case 'reader-theme':
					generalSettings.readerSettings.theme = target.value as 'default' | 'flexoki';
					break;
			}

			// Save settings
			saveSettings();
		});
	});
} 