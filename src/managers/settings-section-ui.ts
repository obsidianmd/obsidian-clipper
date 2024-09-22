import { updateUrl } from '../utils/routing';
import { generalSettings } from '../utils/storage-utils';
import { updatePromptContextVisibility } from './interpreter-settings';
import { Template } from '../types/types';

export function showSettingsSection(section: 'general' | 'interpreter' | 'templates', templateId?: string): void {
	const sections = ['general', 'interpreter', 'templates'];
	
	sections.forEach(s => {
		const sectionElement = document.getElementById(`${s}-section`);
		if (sectionElement) {
			sectionElement.style.display = s === section ? 'block' : 'none';
			sectionElement.classList.toggle('active', s === section);
		}
	});

	// Update sidebar active state
	updateSidebarActiveState(section);

	// Update template list active state if in templates section
	if (section === 'templates' && templateId) {
		updateTemplateListActiveState(templateId);
	}

	updateUrl(section, templateId);

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

function updateSidebarActiveState(activeSection: string): void {
	document.querySelectorAll('#sidebar li').forEach(item => item.classList.remove('active'));
	const activeItem = document.querySelector(`#sidebar li[data-section="${activeSection}"]`);
	if (activeItem) activeItem.classList.add('active');
}

function updateTemplateListActiveState(templateId: string): void {
	const templateListItems = document.querySelectorAll('#template-list li');
	templateListItems.forEach(item => {
		item.classList.remove('active');
		if ((item as HTMLElement).dataset.id === templateId) {
			item.classList.add('active');
		}
	});
}

export function updateInterpreterSettings(): void {
	const interpreterToggle = document.getElementById('interpreter-toggle') as HTMLInputElement;
	const interpreterAutoRunToggle = document.getElementById('interpreter-auto-run-toggle') as HTMLInputElement;

	if (interpreterToggle) {
		interpreterToggle.checked = generalSettings.interpreterEnabled;
	}
	if (interpreterAutoRunToggle) {
		interpreterAutoRunToggle.checked = generalSettings.interpreterAutoRun;
	}
}

export function initializeSidebar(): void {
	const sidebar = document.getElementById('sidebar');
	const settingsContainer = document.getElementById('settings');
	const templateList = document.getElementById('template-list');

	if (sidebar) {
		sidebar.addEventListener('click', (event) => {
			const target = event.target as HTMLElement;
			if (target.dataset.section === 'general' || target.dataset.section === 'interpreter') {
				showSettingsSection(target.dataset.section as 'general' | 'interpreter');
			}
			if (settingsContainer) {
				settingsContainer.classList.remove('sidebar-open');
			}
		});
	}

	if (templateList) {
		templateList.addEventListener('click', (event) => {
			const target = event.target as HTMLElement;
			const listItem = target.closest('li') as HTMLElement;
			if (listItem && listItem.dataset.id) {
				showSettingsSection('templates', listItem.dataset.id);
			}
		});
	}

	const hamburgerMenu = document.getElementById('hamburger-menu');

	if (hamburgerMenu && settingsContainer) {
		hamburgerMenu.addEventListener('click', () => {
			settingsContainer.classList.toggle('sidebar-open');
			hamburgerMenu.classList.toggle('is-active');
		});
	}
}
