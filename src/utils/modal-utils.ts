export function showModal(modal: HTMLElement | null): void {
	if (modal) {
		modal.style.display = 'block';
	}
}

export function hideModal(modal: HTMLElement | null): void {
	if (modal) {
		modal.style.display = 'none';
	}
}