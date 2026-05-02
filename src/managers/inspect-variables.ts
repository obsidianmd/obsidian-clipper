import { initializeIcons } from '../icons/icons';
import { debounce } from '../utils/debounce';
import { Template } from '../types/types';
import { getMessage } from '../utils/i18n';
import { copyToClipboard } from '../utils/clipboard-utils';

let variablesPanel: HTMLElement;
let currentTemplate: Template | null;
let currentVariables: { [key: string]: string };
let isPanelOpen: boolean = false;
let currentSearchTerm: string = '';

function createVariableItem(key: string, value: string): HTMLElement {
	const cleanKey = key.replace(/^{{|}}$/g, '');
	
	const variableItem = document.createElement('div');
	variableItem.className = 'variable-item is-collapsed';
	
	const variableKey = document.createElement('span');
	variableKey.className = 'variable-key';
	variableKey.setAttribute('data-variable', key);
	variableKey.textContent = cleanKey;
	
	const variableValue = document.createElement('span');
	variableValue.className = 'variable-value';
	variableValue.textContent = value;
	
	const chevronIcon = document.createElement('span');
	chevronIcon.className = 'chevron-icon';
	chevronIcon.setAttribute('aria-label', 'Expand');
	
	const chevronI = document.createElement('i');
	chevronI.setAttribute('data-lucide', 'chevron-right');
	chevronIcon.appendChild(chevronI);
	
	variableItem.appendChild(variableKey);
	variableItem.appendChild(variableValue);
	variableItem.appendChild(chevronIcon);
	
	return variableItem;
}

function populateVariableList(container: HTMLElement, variables: { [key: string]: string }): void {
	container.textContent = '';

	Object.entries(variables).forEach(([key, value]) => {
		const variableItem = createVariableItem(key, value);
		container.appendChild(variableItem);
	});
}

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
		if (!isUpdate) {
			variablesPanel.textContent = '';

			const headerDiv = document.createElement('div');
			headerDiv.className = 'variables-header';
			
			// Create header title container
			const headerTitleDiv = document.createElement('div');
			headerTitleDiv.className = 'variables-header-title';
			
			// Create title
			const titleH3 = document.createElement('h3');
			titleH3.textContent = getMessage('pageVariables');
			headerTitleDiv.appendChild(titleH3);
			
			// Create close button
			const closeSpan = document.createElement('span');
			closeSpan.className = 'close-panel clickable-icon';
			closeSpan.setAttribute('aria-label', getMessage('close'));
			
			const closeIcon = document.createElement('i');
			closeIcon.setAttribute('data-lucide', 'x');
			closeSpan.appendChild(closeIcon);
			headerTitleDiv.appendChild(closeSpan);
			
			headerDiv.appendChild(headerTitleDiv);
			
			// Create search input
			const searchInput = document.createElement('input');
			searchInput.type = 'text';
			searchInput.id = 'variables-search';
			searchInput.placeholder = getMessage('searchVariables');
			headerDiv.appendChild(searchInput);
			
			// Create variable list container
			const variableListDiv = document.createElement('div');
			variableListDiv.className = 'variable-list';
			populateVariableList(variableListDiv, currentVariables);
			
			// Append to panel
			variablesPanel.appendChild(headerDiv);
			variablesPanel.appendChild(variableListDiv);

			variablesPanel.classList.add('show');
			document.body.classList.add('variables-panel-open');
			isPanelOpen = true;
			initializeIcons();

			// Setup event listeners with references to the created elements
			searchInput.addEventListener('input', debounce(handleVariableSearch, 300));
			closeSpan.addEventListener('click', function() {
				variablesPanel.classList.remove('show');
				document.body.classList.remove('variables-panel-open');
				isPanelOpen = false;
				currentSearchTerm = '';
			});
			
			const showMoreActionsButton = document.getElementById('show-variables');
			if (showMoreActionsButton) {
				showMoreActionsButton.addEventListener('click', closeVariablesPanel);
			}
		} else {
			const variableList = variablesPanel.querySelector('.variable-list') as HTMLElement;
			if (variableList) {
				populateVariableList(variableList, currentVariables);
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
				copyToClipboard(variableName).then(success => {
					if (success) {
						const originalText = this.textContent;
						this.textContent = getMessage('copied');
						setTimeout(() => {
							this.textContent = originalText;
						}, 1000);
					} else {
						console.error('Failed to copy text');
					}
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
	const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');

	element.textContent = '';
	
	// Split text and create text nodes with mark elements
	let lastIndex = 0;
	let match;
	
	while ((match = regex.exec(originalText)) !== null) {
		// Add text before match
		if (match.index > lastIndex) {
			const textNode = document.createTextNode(originalText.slice(lastIndex, match.index));
			element.appendChild(textNode);
		}
		
		// Add highlighted match
		const mark = document.createElement('mark');
		mark.textContent = match[0];
		element.appendChild(mark);
		
		lastIndex = match.index + match[0].length;
	}
	
	// Add remaining text
	if (lastIndex < originalText.length) {
		const textNode = document.createTextNode(originalText.slice(lastIndex));
		element.appendChild(textNode);
	}
}

function resetHighlight(element: HTMLElement) {
	element.textContent = element.textContent || '';
}