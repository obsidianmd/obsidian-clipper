export function showModal(modal: HTMLElement | null): void {
	if (modal) {
		modal.style.display = 'flex';
	}
}

export function hideModal(modal: HTMLElement | null): void {
	if (modal) {
		modal.style.display = 'none';
	}
}