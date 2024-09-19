import { updateUrl } from '../utils/routing';
import { generalSettings } from '../utils/storage-utils';
import { updatePromptContextVisibility } from './interpreter-settings';

export function showSettingsSection(section: 'general' | 'interpreter' | 'templates'): void {
	const sections = ['general', 'interpreter', 'templates'];
	
	sections.forEach(s => {
		const sectionElement = document.getElementById(`${s}-section`);
		if (sectionElement) {
			sectionElement.style.display = s === section ? 'block' : 'none';
			sectionElement.classList.toggle('active', s === section);
		}
	});

	// Update sidebar active state
	document.querySelectorAll('#sidebar li').forEach(item => item.classList.remove('active'));
	const activeItem = document.querySelector(`#sidebar li[data-section="${section}"]`);
	if (activeItem) activeItem.classList.add('active');

	updateUrl(section);

	if (section === 'interpreter') {
		updateInterpreterSettings();
	}

	if (section === 'templates') {
		const templateEditor = document.getElementById('template-editor');
		if (templateEditor) {
			templateEditor.style.display = 'block';
		}
	}

	updatePromptContextVisibility();
}

function updateInterpreterSettings(): void {
	const interpreterToggle = document.getElementById('interpreter-toggle') as HTMLInputElement;
	const interpreterAutoRunToggle = document.getElementById('interpreter-auto-run-toggle') as HTMLInputElement;

	if (interpreterToggle) {
		interpreterToggle.checked = generalSettings.interpreterEnabled;
	}
	if (interpreterAutoRunToggle) {
		interpreterAutoRunToggle.checked = generalSettings.interpreterAutoRun;
	}
}
