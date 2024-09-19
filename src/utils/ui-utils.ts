export function initializeToggles(): void {
	const checkboxContainers = document.querySelectorAll('.checkbox-container');
	
	checkboxContainers.forEach(container => {
		const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
		
		if (checkbox) {
			// Update toggle state based on checkbox
			updateToggleState(container as HTMLElement, checkbox);

			checkbox.addEventListener('change', () => {
				updateToggleState(container as HTMLElement, checkbox);
			});
			container.addEventListener('click', (event) => {
				event.preventDefault();
				checkbox.checked = !checkbox.checked;
				checkbox.dispatchEvent(new Event('change'));
			});
		}
	});
}

export function updateToggleState(container: HTMLElement, checkbox: HTMLInputElement): void {
	if (checkbox.checked) {
		container.classList.add('is-enabled');
	} else {
		container.classList.remove('is-enabled');
	}
}
