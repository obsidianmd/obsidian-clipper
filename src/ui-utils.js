export function initializeSidebar() {
	const sidebarItems = document.querySelectorAll('.sidebar li[data-section]');
	const sections = document.querySelectorAll('.settings-section');

	sidebarItems.forEach(item => {
		item.addEventListener('click', () => {
			const sectionId = item.dataset.section;
			sidebarItems.forEach(i => i.classList.remove('active'));
			item.classList.add('active');
			document.querySelectorAll('#template-list li').forEach(templateItem => templateItem.classList.remove('active'));
			document.getElementById('template-editor').style.display = 'none';
			editingTemplateIndex = -1;
			sections.forEach(section => {
				section.classList.remove('active');
				if (section.id === `${sectionId}-section`) {
					section.classList.add('active');
				}
			});
		});
	});
}