export function initializeToggles(container?: HTMLElement | string): void {
	let searchRoot: HTMLElement | Document;
	
	if (!container) {
		searchRoot = document;
	} else if (typeof container === 'string') {
		const containerElement = document.getElementById(container);
		if (!containerElement) {
			console.warn(`Container with ID "${container}" not found`);
			return;
		}
		searchRoot = containerElement;
	} else {
		searchRoot = container;
	}
	
	const checkboxContainers = searchRoot.querySelectorAll('.checkbox-container');
	
	checkboxContainers.forEach(container => {
		// Skip if already initialized
		if (container.hasAttribute('data-toggle-initialized')) {
			return;
		}

		const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
		
		if (checkbox) {
			// Update toggle state based on checkbox
			updateToggleState(container as HTMLElement, checkbox);

			checkbox.addEventListener('change', () => {
				updateToggleState(container as HTMLElement, checkbox);
				console.log('changed');
			});
			
			container.addEventListener('click', (event) => {
				event.preventDefault();
				checkbox.checked = !checkbox.checked;
				checkbox.dispatchEvent(new Event('change'));
				console.log('clicked');
			});

			// Mark as initialized
			container.setAttribute('data-toggle-initialized', 'true');
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

export function adjustNoteNameHeight(textarea: HTMLTextAreaElement): void {
	textarea.style.minHeight = '2rem';
	textarea.style.minHeight = textarea.scrollHeight + 'px';
}
