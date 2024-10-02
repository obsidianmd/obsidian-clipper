export function showModal(modal: HTMLElement | null): void {
	if (modal) {
		modal.style.display = 'flex';
		
		const modalBg = modal.querySelector('.modal-bg');
		if (modalBg) {
			modalBg.addEventListener('click', () => hideModal(modal));
		}
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

		// Clear the textarea content
		const textarea = modal.querySelector('#import-json-textarea') as HTMLTextAreaElement;
		if (textarea) {
			textarea.value = '';
		}
	}
}