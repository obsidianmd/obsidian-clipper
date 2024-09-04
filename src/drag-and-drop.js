let isReordering = false;
let draggedElement = null;

export function initializeDragAndDrop() {
	const draggableLists = [
		document.getElementById('template-list'),
		document.getElementById('template-properties'),
		document.getElementById('vault-list')
	];

	draggableLists.forEach(list => {
		if (list) {
			list.addEventListener('dragstart', handleDragStart);
			list.addEventListener('dragover', handleDragOver);
			list.addEventListener('drop', handleDrop);
			list.addEventListener('dragend', handleDragEnd);
		}
	});
}

export function handleDragStart(e) {
	draggedElement = e.target.closest('[draggable]');
	e.dataTransfer.effectAllowed = 'move';
	e.dataTransfer.setData('text/plain', draggedElement.dataset.id);
	setTimeout(() => {
		draggedElement.classList.add('dragging');
	}, 0);
}

export function handleDragOver(e) {
	e.preventDefault();
	e.dataTransfer.dropEffect = 'move';
	const closestDraggable = e.target.closest('[draggable]');
	if (closestDraggable && closestDraggable !== draggedElement) {
		const rect = closestDraggable.getBoundingClientRect();
		const midY = rect.top + rect.height / 2;
		if (e.clientY < midY) {
			closestDraggable.parentNode.insertBefore(draggedElement, closestDraggable);
		} else {
			closestDraggable.parentNode.insertBefore(draggedElement, closestDraggable.nextSibling);
		}
	}
}

export function handleDrop(e) {
	e.preventDefault();
	const draggedItemId = e.dataTransfer.getData('text/plain');
	const list = e.target.closest('ul, #template-properties');
	
	if (list && draggedElement) {
		const items = Array.from(list.children);
		const newIndex = items.indexOf(draggedElement);
		
		if (list.id === 'template-list') {
			handleTemplateReorder(draggedItemId, newIndex);
		} else if (list.id === 'template-properties') {
			handlePropertyReorder(draggedItemId, newIndex);
		} else if (list.id === 'vault-list') {
			handleVaultReorder(newIndex);
		}
		
		draggedElement.classList.remove('dragging');
	}
	
	draggedElement = null;
}

export function handleDragEnd(e) {
	if (draggedElement) {
		draggedElement.classList.remove('dragging');
	}
	draggedElement = null;
}

function handleTemplateReorder(draggedItemId, newIndex) {
	// This function should be implemented in template-manager.js
	// and imported here if needed
}

function handlePropertyReorder(draggedItemId, newIndex) {
	// This function should be implemented in template-manager.js
	// and imported here if needed
}

function handleVaultReorder(newIndex) {
	// This function should be implemented in vault-manager.js
	// and imported here if needed
}