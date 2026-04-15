import { updateUrl } from '../utils/routing';
import { generalSettings } from '../utils/storage-utils';
import { updatePromptContextVisibility } from './interpreter-settings';
import { initializePropertyTypesManager } from './property-types-manager';

export type SettingsSection = 'general' | 'properties' | 'highlighter' | 'interpreter' | 'reader' | 'templates';

export function showSettingsSection(section: SettingsSection, templateId?: string): void {
	const sections = document.querySelectorAll('.settings-section');
	const sidebarItems = document.querySelectorAll('#sidebar li[data-section]');

	sections.forEach(s => s.classList.remove('active'));
	sidebarItems.forEach(item => item.classList.remove('active'));

	const selectedSection = document.getElementById(`${section}-section`);
	const selectedSidebarItem = document.querySelector(`#sidebar li[data-section="${section}"]`);

	if (selectedSection) {
		selectedSection.classList.add('active');
	}
	if (selectedSidebarItem) {
		selectedSidebarItem.classList.add('active');
	}

	updateUrl(section, templateId);

	if (section === 'properties') {
		initializePropertyTypesManager();
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

export function initializeSidebar(): void {
	const sidebar = document.getElementById('sidebar');
	const settingsContainer = document.getElementById('settings');
	const templateList = document.getElementById('template-list');
	const hamburgerMenu = document.getElementById('hamburger-menu');
	const sidebarTitle = document.getElementById('settings-sidebar-title');

	if (sidebarTitle) {
		sidebarTitle.addEventListener('click', () => {
			showSettingsSection('general');
		});
	}

	if (sidebar) {
		sidebar.addEventListener('click', (event) => {
			const target = event.target as HTMLElement;
			const li = target.closest('li[data-section]') as HTMLElement | null;
			const section = li?.dataset.section;
			if (section === 'general'
				|| section === 'properties'
				|| section === 'highlighter'
				|| section === 'interpreter'
				|| section === 'reader') {
				showSettingsSection(section as 'general' | 'properties' | 'highlighter' | 'interpreter' | 'reader');
			}
			if (settingsContainer) {
				settingsContainer.classList.remove('sidebar-open');
			}
			if (hamburgerMenu) {
				hamburgerMenu.classList.remove('is-active');
			}
		});
	}

	if (templateList) {
		templateList.addEventListener('click', (event) => {
			const target = event.target as HTMLElement;
			const listItem = target.closest('li') as HTMLElement;
			if (listItem && listItem.dataset.id) {
				showSettingsSection('templates', listItem.dataset.id);
				if (settingsContainer) {
					settingsContainer.classList.remove('sidebar-open');
				}
				if (hamburgerMenu) {
					hamburgerMenu.classList.remove('is-active');
				}
			}
		});
	}

	if (hamburgerMenu && settingsContainer) {
		hamburgerMenu.addEventListener('click', () => {
			settingsContainer.classList.toggle('sidebar-open');
			hamburgerMenu.classList.toggle('is-active');
		});
	}
}
