import { showModal, hideModal } from './modal-utils';
import { importTemplateFile } from './import-export';

export function showImportModal(
	modalId: string,
	importFunction: (content: string) => Promise<void>,
	fileExtension: string = '.json',
	dropZoneText: string = 'Drag and drop file here',
	textareaPlaceholder: string = 'Paste JSON here',
	isTemplateImport: boolean = false
): void {
	const modal = document.getElementById(modalId);
	const dropZone = modal?.querySelector('.import-drop-zone') as HTMLElement;
	const jsonTextarea = modal?.querySelector('.import-json-textarea') as HTMLTextAreaElement;
	const cancelBtn = modal?.querySelector('.import-cancel-btn') as HTMLElement;
	const confirmBtn = modal?.querySelector('.import-confirm-btn') as HTMLElement;

	if (!modal || !dropZone || !jsonTextarea || !cancelBtn || !confirmBtn) {
		console.error('Import modal elements not found');
		return;
	}

	// Set custom text
	const dropZoneTextElement = dropZone.querySelector('p');
	if (dropZoneTextElement) dropZoneTextElement.textContent = dropZoneText;
	jsonTextarea.placeholder = textareaPlaceholder;

	// Clear the textarea when showing the modal
	jsonTextarea.value = '';

	showModal(modal);

	// Remove existing event listeners
	dropZone.removeEventListener('dragover', handleDragOver);
	dropZone.removeEventListener('drop', handleDrop);
	dropZone.removeEventListener('click', openFilePicker);
	cancelBtn.removeEventListener('click', handleCancel);
	confirmBtn.removeEventListener('click', handleConfirm);

	// Add event listeners
	dropZone.addEventListener('dragover', handleDragOver);
	dropZone.addEventListener('drop', handleDrop);
	dropZone.addEventListener('click', openFilePicker);
	cancelBtn.addEventListener('click', handleCancel);
	confirmBtn.addEventListener('click', handleConfirm);

	let fileInput: HTMLInputElement | null = null;

	function handleDragOver(e: DragEvent): void {
		e.preventDefault();
		e.stopPropagation();
	}

	function handleDrop(e: DragEvent): void {
		e.preventDefault();
		e.stopPropagation();
		const files = e.dataTransfer?.files;
		if (files && files.length > 0) {
			handleFile(files[0]);
		}
	}

	function openFilePicker(e: Event): void {
		e.preventDefault();
		e.stopPropagation();
		fileInput = document.createElement('input');
		fileInput.type = 'file';
		fileInput.accept = fileExtension;
		fileInput.onchange = handleFileInputChange;
		fileInput.click();
	}

	function handleFileInputChange(event: Event): void {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (file) {
			handleFile(file);
		}
		// Clean up the file input
		if (fileInput) {
			fileInput.remove();
			fileInput = null;
		}
	}

	function handleFile(file: File): void {
		if (isTemplateImport) {
			importTemplateFile(file);
			cleanupModal();
			hideModal(modal);
		} else {
			const reader = new FileReader();
			reader.onload = (event: ProgressEvent<FileReader>) => {
				const content = event.target?.result as string;
				if (jsonTextarea) {
					jsonTextarea.value = content;
				}
				// Immediately import the file
				importFunction(content).then(() => {
					cleanupModal();
					hideModal(modal);
				}).catch((error) => {
					console.error('Import failed:', error);
					alert('Import failed. Please check the console for more details.');
				});
			};
			reader.readAsText(file);
		}
	}

	function handleCancel(): void {
		cleanupModal();
		hideModal(modal);
	}

	function handleConfirm(): void {
		if (jsonTextarea) {
			const jsonContent = jsonTextarea.value.trim();
			if (jsonContent) {
				importFunction(jsonContent).then(() => {
					cleanupModal();
					hideModal(modal);
				}).catch((error) => {
					console.error('Import failed:', error);
					alert('Import failed. Please check the console for more details.');
				});
			}
		}
	}

	function cleanupModal(): void {
		// Remove event listeners
		if (dropZone) {
			dropZone.removeEventListener('dragover', handleDragOver);
			dropZone.removeEventListener('drop', handleDrop);
			dropZone.removeEventListener('click', openFilePicker);
		}
		if (cancelBtn) {
			cancelBtn.removeEventListener('click', handleCancel);
		}
		if (confirmBtn) {
			confirmBtn.removeEventListener('click', handleConfirm);
		}

		// Clean up the file input if it exists
		if (fileInput) {
			fileInput.remove();
			fileInput = null;
		}
	}
}