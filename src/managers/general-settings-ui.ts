import { updateUrl } from '../utils/routing';

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
	const templatesSection = document.getElementById('templates-section');

	if (generalSection) {
		generalSection.style.display = 'block';
		generalSection.classList.add('active');
	}
	if (interpreterSection) interpreterSection.style.display = 'none';
	if (templatesSection) templatesSection.style.display = 'none';

	updateUrl('general');

	// Update sidebar active state
	document.querySelectorAll('.sidebar li').forEach(item => item.classList.remove('active'));
	const generalItem = document.querySelector('.sidebar li[data-section="general"]');
	if (generalItem) generalItem.classList.add('active');
}
