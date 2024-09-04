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
