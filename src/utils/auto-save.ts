import { saveTemplateSettings, updateTemplateList, updateTemplateFromForm, addPropertyToEditor, editingTemplateIndex } from '../managers/template-manager';

let isReordering = false;

export function initializeAutoSave(): void {
	const templateForm = document.getElementById('template-settings-form');
	if (!templateForm) {
		console.error('Template form not found');
		return;
	}

	const debounce = <T extends (...args: any[]) => any>(func: T, delay: number): ((...args: Parameters<T>) => void) => {
		let debounceTimer: NodeJS.Timeout | null = null;
		return function(this: any, ...args: Parameters<T>) {
			const context = this;
			if (debounceTimer) clearTimeout(debounceTimer);
			debounceTimer = setTimeout(() => func.apply(context, args), delay);
		}
	};

	const autoSave = debounce(async () => {
		if (!isReordering) {
			try {
				updateTemplateFromForm();
				await saveTemplateSettings();
				updateTemplateList();
				console.log('Auto-save completed');
			} catch (error) {
				console.error('Auto-save failed:', error);
			}
		}
	}, 500);

	templateForm.addEventListener('input', () => {
		if (editingTemplateIndex !== -1) {
			updateTemplateFromForm();
			autoSave();
		}
	});

	const templateProperties = document.getElementById('template-properties');
	if (templateProperties) {
		templateProperties.addEventListener('click', (event) => {
			const target = event.target as HTMLElement;
			if (target.classList.contains('remove-property-btn') || target.closest('.remove-property-btn')) {
				if (editingTemplateIndex !== -1) {
					updateTemplateFromForm();
					autoSave();
				}
			}
		});

		templateProperties.addEventListener('change', (event) => {
			const target = event.target as HTMLElement;
			if (target.classList.contains('property-type')) {
				if (editingTemplateIndex !== -1) {
					updateTemplateFromForm();
					autoSave();
				}
			}
		});
	}

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
