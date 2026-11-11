import { getMessage } from './i18n';

export const CUSTOM_PATH_VALUE = '__custom_path__';

const INDENT = '\u00A0\u00A0';

export function formatFolderLabel(path: string): string {
	const segments = path.split('/');
	const depth = Math.max(0, segments.length - 1);
	return INDENT.repeat(depth) + segments[segments.length - 1];
}

export function populateFolderSelect(
	select: HTMLSelectElement,
	folders: string[],
	currentValue: string
): boolean {
	const value = currentValue ?? '';
	select.textContent = '';

	const rootOption = document.createElement('option');
	rootOption.value = '';
	rootOption.textContent = getMessage('vaultRootFolder');
	select.appendChild(rootOption);

	for (const folder of folders) {
		const option = document.createElement('option');
		option.value = folder;
		option.textContent = formatFolderLabel(folder);
		select.appendChild(option);
	}

	// Keep an existing path that is not part of the scanned tree (for example a
	// templated path such as "Clippings/{{date}}") so it is never silently lost.
	const isUnrecognized = value !== '' && !folders.includes(value);
	if (isUnrecognized) {
		const option = document.createElement('option');
		option.value = value;
		option.textContent = `${value} (${getMessage('notScanned')})`;
		select.appendChild(option);
	}

	const customOption = document.createElement('option');
	customOption.value = CUSTOM_PATH_VALUE;
	customOption.textContent = getMessage('customPath');
	select.appendChild(customOption);

	select.value = value;
	return isUnrecognized;
}

export function syncFolderFieldVisibility(select: HTMLSelectElement, input: HTMLInputElement): boolean {
	const isCustom = select.value === CUSTOM_PATH_VALUE;
	input.style.display = isCustom ? '' : 'none';
	return isCustom;
}

export function getFolderFieldValue(select: HTMLSelectElement, input: HTMLInputElement): string {
	if (select.value === CUSTOM_PATH_VALUE) {
		return input.value.trim();
	}
	return select.value;
}

export function setFolderField(
	select: HTMLSelectElement,
	input: HTMLInputElement,
	folders: string[],
	value: string
): void {
	const isCustom = populateFolderSelect(select, folders, value);
	input.value = value ?? '';
	input.style.display = isCustom ? '' : 'none';
}

export function handleFolderSelectChange(select: HTMLSelectElement, input: HTMLInputElement): void {
	if (syncFolderFieldVisibility(select, input)) {
		input.focus();
	}
}

export function handleFolderInputChange(
	select: HTMLSelectElement,
	input: HTMLInputElement,
	folders: string[]
): void {
	const value = input.value.trim();
	if (value && folders.includes(value)) {
		select.value = value;
		input.style.display = 'none';
	}
}
