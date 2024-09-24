import { initializeIcons } from '../icons/icons';
import { debounce } from '../utils/debounce';
import { formatVariables } from '../utils/string-utils';
import { Template } from '../types/types';

let variablesPanel: HTMLElement;
let currentTemplate: Template | null;
let currentVariables: { [key: string]: string };

export function initializeVariablesPanel(panel: HTMLElement, template: Template | null, variables: { [key: string]: string }) {
	variablesPanel = panel;
	currentTemplate = template;
	currentVariables = variables;
}

export function showVariables() {
	console.log('showVariables function called');
	console.log('currentTemplate:', currentTemplate);
	console.log('currentVariables:', currentVariables);

	if (!variablesPanel) {
		console.error('variablesPanel is not initialized');
		return;
	}

	if (currentTemplate && Object.keys(currentVariables).length > 0) {
		console.log('Conditions met, preparing to show variables');
		const formattedVariables = formatVariables(currentVariables);
		console.log('formattedVariables:', formattedVariables);

		console.log('Updating variablesPanel innerHTML');
		variablesPanel.innerHTML = `
			<div class="variables-header">
				<h3>Page variables</h3>
				<input type="text" id="variables-search" placeholder="Search variables...">
				<span class="close-panel clickable-icon" aria-label="Close">
					<i data-lucide="x"></i>
				</span>
			</div>
			<div class="variable-list">${formattedVariables}</div>
		`;
		console.log('variablesPanel innerHTML updated');

		console.log('Adding show class to variablesPanel');
		variablesPanel.classList.add('show');
		console.log('show class added to variablesPanel');

		console.log('Initializing icons');
		initializeIcons();
		console.log('Icons initialized');

		// Search variables
		const searchInput = variablesPanel.querySelector('#variables-search') as HTMLInputElement;
		if (searchInput) {
			console.log('Adding event listener to search input');
			searchInput.addEventListener('input', debounce(handleVariableSearch, 300));
			console.log('Event listener added to search input');
		} else {
			console.error('Search input not found');
		}

		console.log('Calling handleVariableSearch');
		handleVariableSearch();
		console.log('handleVariableSearch called');

		// Add click event listener to close panel
		const closePanel = variablesPanel.querySelector('.close-panel') as HTMLElement;
		if (closePanel) {
			console.log('Adding event listener to close panel');
			closePanel.addEventListener('click', function() {
				console.log('Close panel clicked');
				variablesPanel.classList.remove('show');
			});
			console.log('Event listener added to close panel');
		} else {
			console.error('Close panel button not found');
		}

		console.log('Variables panel should now be visible');
	} else {
		console.log('No variables available to display');
	}
}

function handleVariableSearch() {
	const searchInput = document.getElementById('variables-search') as HTMLInputElement;
	const searchTerm = searchInput.value.trim().toLowerCase();
	const variableItems = variablesPanel.querySelectorAll('.variable-item');

	variableItems.forEach((item: Element) => {
		const htmlItem = item as HTMLElement;
		const key = htmlItem.querySelector('.variable-key') as HTMLElement;
		const value = htmlItem.querySelector('.variable-value') as HTMLElement;
		const keyText = key.textContent?.toLowerCase() || '';
		const valueText = value.textContent?.toLowerCase() || '';

		if (searchTerm.length < 2) {
			htmlItem.style.display = 'flex';
			resetHighlight(key);
			resetHighlight(value);
		} else if (keyText.includes(searchTerm) || valueText.includes(searchTerm)) {
			htmlItem.style.display = 'flex';
			highlightText(key, searchTerm);
			highlightText(value, searchTerm);
		} else {
			htmlItem.style.display = 'none';
		}
	});
}

function highlightText(element: HTMLElement, searchTerm: string) {
	const originalText = element.textContent || '';
	const regex = new RegExp(`(${searchTerm})`, 'gi');
	element.innerHTML = originalText.replace(regex, '<mark>$1</mark>');
}

function resetHighlight(element: HTMLElement) {
	element.innerHTML = element.textContent || '';
}