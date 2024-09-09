import { editingTemplateIndex, setEditingTemplateIndex } from '../managers/template-manager';

export function initializeSidebar(): void {
	const sidebarItems = document.querySelectorAll('.sidebar li[data-section]');
	const sections = document.querySelectorAll('.settings-section');

	sidebarItems.forEach(item => {
		item.addEventListener('click', () => {
			const sectionId = (item as HTMLElement).dataset.section;
			sidebarItems.forEach(i => i.classList.remove('active'));
			item.classList.add('active');
			document.querySelectorAll('#template-list li').forEach(templateItem => templateItem.classList.remove('active'));
			const templateEditor = document.getElementById('template-editor');
			if (templateEditor) {
				templateEditor.style.display = 'none';
			}
			setEditingTemplateIndex(-1);
			sections.forEach(section => {
				if (section.id === `${sectionId}-section`) {
					(section as HTMLElement).style.display = 'block';
					section.classList.add('active');
				} else {
					(section as HTMLElement).style.display = 'none';
					section.classList.remove('active');
				}
			});
		});
	});
}

export function initializeToggles(): void {
	const checkboxContainers = document.querySelectorAll('.checkbox-container');
	
	checkboxContainers.forEach(container => {
		const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
		
		if (checkbox) {
			// Update toggle state based on checkbox
			updateToggleState(container as HTMLElement, checkbox);

			checkbox.addEventListener('change', () => {
				updateToggleState(container as HTMLElement, checkbox);
			});
			container.addEventListener('click', (event) => {
				event.preventDefault();
				checkbox.checked = !checkbox.checked;
				checkbox.dispatchEvent(new Event('change'));
			});
		}
	});
}

function updateToggleState(container: HTMLElement, checkbox: HTMLInputElement): void {
	if (checkbox.checked) {
		container.classList.add('is-enabled');
	} else {
		container.classList.remove('is-enabled');
	}
}
