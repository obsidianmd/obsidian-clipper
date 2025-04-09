export function showModal(modal: HTMLElement | null): void {
	if (modal) {
		modal.style.display = 'flex';
		
		const modalBg = modal.querySelector('.modal-bg');
		if (modalBg) {
			modalBg.addEventListener('click', () => hideModal(modal));
		}

		// Add escape key listener when showing modal
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				hideModal(modal);
			}
		};
		document.addEventListener('keydown', handleEscape);

		// Store the escape handler on the modal element for cleanup
		modal.dataset.escapeHandler = 'true';
		(modal as any).escapeHandler = handleEscape;
	}
}

export function hideModal(modal: HTMLElement | null): void {
	if (modal) {
		modal.style.display = 'none';
		
		// Remove the event listener when hiding the modal
		const modalBg = modal.querySelector('.modal-bg');
		if (modalBg) {
			modalBg.removeEventListener('click', () => hideModal(modal));
		}

		// Remove escape key handler if it exists
		if (modal.dataset.escapeHandler === 'true') {
			const handler = (modal as any).escapeHandler;
			if (handler) {
				document.removeEventListener('keydown', handler);
				delete (modal as any).escapeHandler;
			}
			delete modal.dataset.escapeHandler;
		}

		// Clear the textarea content
		const textarea = modal.querySelector('#import-json-textarea') as HTMLTextAreaElement;
		if (textarea) {
			textarea.value = '';
		}
	}
}