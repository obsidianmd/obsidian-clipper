import { generalSettings, saveSettings, loadSettings } from '../utils/storage-utils';
import { getMessage } from '../utils/i18n';
import { initializeIcons } from '../icons/icons';
import { createElementWithClass, createElementWithHTML } from '../utils/dom-utils';

function isValidVariableName(name: string): boolean {
	return /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name);
}

export function initializeCustomVariablesSettings(): void {
	const list = document.getElementById('custom-variables-list');
	const addBtn = document.getElementById('add-custom-variable-btn');
	if (!list || !addBtn) return;

	function makeRow(id: string, name: string, value: string): HTMLElement {
		const row = createElementWithClass('div', 'property-editor');
		row.setAttribute('draggable', 'true');
		row.dataset.id = id;

		// Drag handle (visual only)
		const dragHandle = createElementWithClass('div', 'drag-handle');
		dragHandle.appendChild(createElementWithHTML('i', '', { 'data-lucide': 'grip-vertical' }));
		row.appendChild(dragHandle);

		// Name input
		const nameInput = createElementWithHTML('input', '', {
			type: 'text',
			class: 'property-name',
			id: `${id}-name`,
			value: name,
			placeholder: getMessage('propertyName') || 'Name',
			autocapitalize: 'off',
			autocomplete: 'off',
			spellcheck: 'false',
		}) as HTMLInputElement;
		row.appendChild(nameInput);

		// Value input
		const valueInput = createElementWithHTML('input', '', {
			type: 'text',
			class: 'property-value',
			id: `${id}-value`,
			value: value,
			placeholder: getMessage('propertyValue') || 'Value',
		}) as HTMLInputElement;
		row.appendChild(valueInput);

		// Remove button
		const removeBtn = createElementWithClass('button', 'remove-property-btn clickable-icon');
		removeBtn.setAttribute('type', 'button');
		removeBtn.setAttribute('aria-label', getMessage('removeProperty') || 'Remove');
		removeBtn.appendChild(createElementWithHTML('i', '', { 'data-lucide': 'trash-2' }));
		row.appendChild(removeBtn);

		// Handlers
		nameInput.addEventListener('change', async () => {
			const newName = nameInput.value.trim();
			if (newName === name) return;
			if (!isValidVariableName(newName)) {
				alert(getMessage('invalidVariableName') || 'Invalid name. Use alphanumeric, hyphen, underscore, starting with a letter.');
				nameInput.value = name; // revert
				return;
			}
			generalSettings.customVariables = generalSettings.customVariables || {};
			if (newName in generalSettings.customVariables && newName !== name) {
				alert(getMessage('variableAlreadyExists') || 'A variable with this name already exists.');
				nameInput.value = name; // revert
				return;
			}
			const currentVal = generalSettings.customVariables?.[name] ?? valueInput.value;
			// rename key
			delete generalSettings.customVariables?.[name];
			generalSettings.customVariables![newName] = currentVal;
			await saveSettings();
			// Update local reference so future edits use the new key without re-rendering
			name = newName;
		});

		valueInput.addEventListener('change', async () => {
			generalSettings.customVariables = generalSettings.customVariables || {};
			const key = nameInput.value.trim();
			if (!isValidVariableName(key)) return; // ignore until valid name
			generalSettings.customVariables[key] = valueInput.value;
			await saveSettings();
		});

		removeBtn.addEventListener('click', async () => {
			generalSettings.customVariables = generalSettings.customVariables || {};
			const key = nameInput.value.trim();
			if (key in generalSettings.customVariables) {
				delete generalSettings.customVariables[key];
				await saveSettings();
			}
			// Remove the row without a full re-render
			row.parentElement?.removeChild(row);
		});

		// Do not initialize icons here; initialize after the row is in the DOM
		return row;
	}

	function render(): void {
		if (!list) return;
		list.innerHTML = '';
		const entries = Object.entries(generalSettings.customVariables || {});
		entries.forEach(([key, value]) => {
			const id = `${Date.now().toString()}-${Math.random().toString(36).slice(2, 11)}`;
			const row = makeRow(id, key, String(value ?? ''));
			list.appendChild(row);
		});
		// Initialize icons for the entire list after rows are attached
		initializeIcons(list);
	}

	addBtn.addEventListener('click', () => {
		const id = `${Date.now().toString()}-${Math.random().toString(36).slice(2, 11)}`;
		const row = makeRow(id, '', '');
		list.appendChild(row);
		initializeIcons(row);
		const nameInput = row.querySelector('.property-name') as HTMLInputElement;
		if (nameInput) {
			nameInput.focus();
			nameInput.addEventListener('blur', async () => {
				const key = nameInput.value.trim();
				if (!key) {
					// Remove empty row on blur if no name provided
					list.removeChild(row);
					return;
				}
				if (!isValidVariableName(key)) {
					alert(getMessage('invalidVariableName') || 'Invalid name. Use alphanumeric, hyphen, underscore, starting with a letter.');
					list.removeChild(row);
					return;
				}
				generalSettings.customVariables = generalSettings.customVariables || {};
				if (generalSettings.customVariables[key]) {
					const ok = confirm(getMessage('overwriteVariableConfirm') || 'Variable exists. Overwrite?');
					if (!ok) {
						list.removeChild(row);
						return;
					}
				}
				const valueInput = row.querySelector('.property-value') as HTMLInputElement;
				generalSettings.customVariables[key] = valueInput?.value ?? '';
				await saveSettings();
				// Keep the row; no full re-render to preserve focus/tab order
			}, { once: true });
		}
	});

	// Ensure settings are loaded before initial render
	loadSettings().then(() => {
		render();
	}).catch((err) => {
		if (list) {
			list.innerHTML = '';
			const errorDiv = document.createElement('div');
			errorDiv.className = 'setting-item-description text-warning';
			const baseMsg = getMessage('failedToLoadSettings') || 'Failed to load settings';
			const detail = err instanceof Error ? err.message : '';
			errorDiv.textContent = detail ? `${baseMsg}: ${detail}` : baseMsg;
			list.appendChild(errorDiv);
		}
	});
}


