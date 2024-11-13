import { initializeIcons } from '../icons/icons';
import { debounce } from '../utils/debounce';
import { formatVariables } from '../utils/string-utils';
import { Template } from '../types/types';
import { getMessage } from '../utils/i18n';

let variablesPanel: HTMLElement;
let currentTemplate: Template | null;
let currentVariables: { [key: string]: string };
let isPanelOpen: boolean = false;
let currentSearchTerm: string = '';

export function initializeVariablesPanel(panel: HTMLElement, template: Template | null, variables: { [key: string]: string }) {
	variablesPanel = panel;
	currentTemplate = template;
	currentVariables = variables;
}

export function updateVariablesPanel(template: Template | null, variables: { [key: string]: string }) {
	currentTemplate = template;
	currentVariables = variables;
	if (isPanelOpen) {
		showVariables(true);
	}
}

export async function showVariables(isUpdate: boolean = false) {
	if (!variablesPanel) {
		console.error('variablesPanel is not initialized');
		return;
	}

	if (currentTemplate && Object.keys(currentVariables).length > 0) {
		const formattedVariables = formatVariables(currentVariables);

		if (!isUpdate) {
			variablesPanel.innerHTML = `
				<div class="variables-header">
  					<div class="variables-header-title">
						<h3>${getMessage('pageVariables')}</h3>
						<span class="close-panel clickable-icon" aria-label="${getMessage('close')}">
							<i data-lucide="x"></i>
						</span>
					</div>
					<input type="text" id="variables-search" placeholder="${getMessage('searchVariables')}">
				</div>
				<div class="variable-list">${formattedVariables}</div>
			`;

			variablesPanel.classList.add('show');
			document.body.classList.add('variables-panel-open');
			isPanelOpen = true;
			initializeIcons();

			// Search variables
			const searchInput = variablesPanel.querySelector('#variables-search') as HTMLInputElement;
			if (searchInput) {
				searchInput.addEventListener('input', debounce(handleVariableSearch, 300));
			}

			const closePanel = variablesPanel.querySelector('.close-panel') as HTMLElement;
			if (closePanel) {
				closePanel.addEventListener('click', function() {
					variablesPanel.classList.remove('show');
					document.body.classList.remove('variables-panel-open');
					isPanelOpen = false;
					currentSearchTerm = '';
				});
			}
			
			const showMoreActionsButton = document.getElementById('show-variables');
			if (showMoreActionsButton) {
				showMoreActionsButton.addEventListener('click', closeVariablesPanel);
			}
		} else {
			const variableList = variablesPanel.querySelector('.variable-list') as HTMLElement;
			if (variableList) {
				variableList.innerHTML = formattedVariables;
			}
		}

		handleVariableSearch();
	} else {
		console.log('No variables available to display');
	}
}

function closeVariablesPanel(e: Event) {
	e.preventDefault();
	variablesPanel.classList.remove('show');
	document.body.classList.remove('variables-panel-open');
	isPanelOpen = false;
	currentSearchTerm = '';

	const showMoreActionsButton = document.getElementById('show-variables');
	if (showMoreActionsButton) {
		showMoreActionsButton.removeEventListener('click', closeVariablesPanel);
	}
}

function handleVariableSearch() {
	const searchInput = document.getElementById('variables-search') as HTMLInputElement;
	currentSearchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
	const variableItems = variablesPanel.querySelectorAll('.variable-item');

	variableItems.forEach((item: Element) => {
		const htmlItem = item as HTMLElement;
		const key = htmlItem.querySelector('.variable-key') as HTMLElement;
		const value = htmlItem.querySelector('.variable-value') as HTMLElement;
		const keyText = key.textContent?.toLowerCase() || '';
		const valueText = value.textContent?.toLowerCase() || '';

		const variableName = key.getAttribute('data-variable');
						
		// Skip contentHtml and fullHtml variables
		if (variableName === '{{contentHtml}}' || variableName === '{{fullHtml}}') {
			item.remove();
			return;
		}

		const chevron = item.querySelector('.chevron-icon') as HTMLElement;
		const valueElement = item.querySelector('.variable-value') as HTMLElement;	
				
		if (valueElement.scrollWidth > valueElement.clientWidth) {
			item.classList.add('has-overflow');
		}

		key.addEventListener('click', function() {
			const variableName = this.getAttribute('data-variable');
			if (variableName) {
				navigator.clipboard.writeText(variableName).then(() => {
					const originalText = this.textContent;
					this.textContent = getMessage('copied');
					setTimeout(() => {
						this.textContent = originalText;
					}, 1000);
				}).catch(err => {
					console.error('Failed to copy text: ', err);
				});
			}
		});

		chevron.addEventListener('click', function() {
			item.classList.toggle('is-collapsed');
			const chevronIcon = this.querySelector('i');
			if (chevronIcon) {
				chevronIcon.setAttribute('data-lucide', item.classList.contains('is-collapsed') ? 'chevron-right' : 'chevron-down');
				initializeIcons();
			}
		});

		if (currentSearchTerm.length < 2) {
			htmlItem.style.display = 'flex';
			resetHighlight(key);
			resetHighlight(value);
		} else if (keyText.includes(currentSearchTerm) || valueText.includes(currentSearchTerm)) {
			htmlItem.style.display = 'flex';
			highlightText(key, currentSearchTerm);
			highlightText(value, currentSearchTerm);
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