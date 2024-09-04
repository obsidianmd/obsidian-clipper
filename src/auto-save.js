import { saveTemplateSettings, updateTemplateList, updateTemplateFromForm, addPropertyToEditor } from './template-manager.js';

let isReordering = false;

export function initializeAutoSave() {
	const templateForm = document.getElementById('template-settings-form');
	if (!templateForm) {
		console.error('Template form not found');
		return;
	}

	const debounce = (func, delay) => {
		let debounceTimer;
		return function() {
			const context = this;
			const args = arguments;
			clearTimeout(debounceTimer);
			debounceTimer = setTimeout(() => func.apply(context, args), delay);
		}
	};

	const autoSave = debounce(async () => {
		if (!isReordering) {
			try {
				await saveTemplateSettings();
				updateTemplateList();
				console.log('Auto-save completed');
			} catch (error) {
				console.error('Auto-save failed:', error);
			}
		}
	}, 500);

	templateForm.addEventListener('input', (event) => {
		if (editingTemplateIndex !== -1) {
			updateTemplateFromForm();
			autoSave();
		}
	});

	const templateProperties = document.getElementById('template-properties');
	templateProperties.addEventListener('click', (event) => {
		if (event.target.classList.contains('remove-property-btn') || event.target.closest('.remove-property-btn')) {
			if (editingTemplateIndex !== -1) {
				updateTemplateFromForm();
				autoSave();
			}
		}
	});

	const addPropertyBtn = document.getElementById('add-property-btn');
	if (addPropertyBtn) {
		addPropertyBtn.addEventListener('click', () => {
			addPropertyToEditor();
			if (editingTemplateIndex !== -1) {
				updateTemplateFromForm();
				autoSave();
			}
		});
	} else {
		console.error('Add property button not found');
	}
}

// ... (other auto-save related functions)