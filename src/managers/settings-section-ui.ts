import { updateUrl } from '../utils/routing';
import { generalSettings } from '../utils/storage-utils';

export function showSettingsSection(): void {
	const generalSection = document.getElementById('general-section');
	const templatesSection = document.getElementById('templates-section');
	if (generalSection) {
		generalSection.style.display = 'block';
		generalSection.classList.add('active');
	}
	if (templatesSection) {
		templatesSection.style.display = 'none';
		templatesSection.classList.remove('active');
	}
	updateUrl('general');

	// Update sidebar active state
	document.querySelectorAll('#sidebar li').forEach(item => item.classList.remove('active'));
	const generalItem = document.querySelector('#sidebar li[data-section="general"]');
	const interpreterSection = document.getElementById('interpreter-section');

	if (generalSection) {
		generalSection.style.display = 'block';
		generalSection.classList.add('active');
	}
	if (interpreterSection) interpreterSection.style.display = 'none';

	updateUrl('general');

	// Update sidebar active state
	document.querySelectorAll('.sidebar li').forEach(item => item.classList.remove('active'));
	if (generalItem) generalItem.classList.add('active');
}

export function showInterpreterSettings(): void {
	// ... existing code ...

	const interpreterToggle = document.getElementById('interpreter-toggle') as HTMLInputElement;
	const interpreterAutoRunToggle = document.getElementById('interpreter-auto-run-toggle') as HTMLInputElement;

	if (interpreterToggle) {
		interpreterToggle.checked = generalSettings.interpreterEnabled;
	}
	if (interpreterAutoRunToggle) {
		interpreterAutoRunToggle.checked = generalSettings.interpreterAutoRun;
	}

	// ... rest of the function ...
}
