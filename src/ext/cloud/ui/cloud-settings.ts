/**
 * Cloud Settings UI
 * Renders cloud storage section in Settings page
 */

import { getMessage } from '../../../utils/i18n';
import { initializeIcons } from '../../../icons/icons';
import { ALL_TARGETS } from '../upload';
import { CloudTarget, CloudTargetType } from '../types';
import { setActiveTargetId } from '../adapters/base';
import { openCloudEditorModal } from './cloud-modal';

/**
 * Mount cloud settings section into DOM
 */
export function mountCloudSettings(): void {
	const addBtn = document.getElementById('add-cloud-target-btn');
	const activeTargetSelect = document.getElementById('cloud-active-target') as HTMLSelectElement;

	if (addBtn) {
		addBtn.addEventListener('click', () => {
			openCloudEditorModal();
		});
	}

	if (activeTargetSelect) {
		activeTargetSelect.addEventListener('change', async () => {
			const value = activeTargetSelect.value;
			if (!value) {
				for (const adapter of ALL_TARGETS) {
					await setActiveTargetId(adapter.activeIdKey, null);
				}
			} else {
				const [type, id] = value.split(':');
				const adapter = ALL_TARGETS.find(a => a.type === type);
				if (adapter) {
					await setActiveTargetId(adapter.activeIdKey, id);
					for (const otherAdapter of ALL_TARGETS) {
						if (otherAdapter.type !== type) {
							await setActiveTargetId(otherAdapter.activeIdKey, null);
						}
					}
				}
			}
		});
	}

	renderCloudTargetList();
}

/**
 * Render cloud target list
 */
export async function renderCloudTargetList(): Promise<void> {
	const listContainer = document.getElementById('cloud-target-list');
	if (!listContainer) return;

	listContainer.textContent = '';

	const allTargets: { target: CloudTarget; adapter: typeof ALL_TARGETS[0] }[] = [];

	for (const adapter of ALL_TARGETS) {
		const list = await adapter.list();
		for (const target of list) {
			allTargets.push({ target, adapter });
		}
	}

	const activeTargetSelect = document.getElementById('cloud-active-target') as HTMLSelectElement;
	if (activeTargetSelect) {
		activeTargetSelect.textContent = '';
		const emptyOption = document.createElement('option');
		emptyOption.value = '';
		emptyOption.textContent = '—';
		activeTargetSelect.appendChild(emptyOption);

		for (const { target, adapter } of allTargets) {
			const option = document.createElement('option');
			option.value = `${adapter.type}:${target.id}`;
			option.textContent = `${target.name} (${adapter.typeLabel})`;
			activeTargetSelect.appendChild(option);
		}

		for (const adapter of ALL_TARGETS) {
			const activeId = await adapter.getActiveId();
			if (activeId) {
				activeTargetSelect.value = `${adapter.type}:${activeId}`;
				break;
			}
		}
	}

	const sortedTargets = [...allTargets].sort((a, b) =>
		a.target.name.toLowerCase().localeCompare(b.target.name.toLowerCase())
	);

	for (const { target, adapter } of sortedTargets) {
		const item = createCloudTargetListItem(target, adapter);
		listContainer.appendChild(item);
	}

	initializeIcons(listContainer);
}

/**
 * Create a cloud target list item (styled like provider-list-item)
 */
function createCloudTargetListItem(target: CloudTarget, adapter: typeof ALL_TARGETS[0]): HTMLElement {
	const item = document.createElement('div');
	item.className = 'cloud-target-list-item';
	item.dataset.targetId = target.id;
	item.dataset.targetType = adapter.type;

	const itemInfo = document.createElement('div');
	itemInfo.className = 'cloud-target-list-item-info';

	const targetName = document.createElement('div');
	targetName.className = 'cloud-target-name';

	const iconContainer = document.createElement('div');
	iconContainer.className = 'cloud-target-icon-container';
	const iconSpan = document.createElement('span');
	iconSpan.className = `cloud-target-icon icon-${adapter.type}`;
	iconContainer.appendChild(iconSpan);

	const nameText = document.createElement('div');
	nameText.className = 'cloud-target-name-text';
	nameText.textContent = target.name;

	targetName.appendChild(iconContainer);
	targetName.appendChild(nameText);
	itemInfo.appendChild(targetName);

	const typeLabel = document.createElement('div');
	typeLabel.className = 'cloud-target-type mh';
	typeLabel.textContent = adapter.typeLabel;
	itemInfo.appendChild(typeLabel);

	const itemActions = document.createElement('div');
	itemActions.className = 'cloud-target-list-item-actions';

	const editBtn = document.createElement('button');
	editBtn.className = 'edit-cloud-target-btn clickable-icon';
	editBtn.setAttribute('aria-label', 'Edit cloud target');
	const editIcon = document.createElement('i');
	editIcon.setAttribute('data-lucide', 'pen-line');
	editBtn.appendChild(editIcon);

	const deleteBtn = document.createElement('button');
	deleteBtn.className = 'delete-cloud-target-btn clickable-icon';
	deleteBtn.setAttribute('aria-label', 'Delete cloud target');
	const deleteIcon = document.createElement('i');
	deleteIcon.setAttribute('data-lucide', 'trash-2');
	deleteBtn.appendChild(deleteIcon);

	itemActions.appendChild(editBtn);
	itemActions.appendChild(deleteBtn);

	item.appendChild(itemInfo);
	item.appendChild(itemActions);

	editBtn.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		openCloudEditorModal(adapter.type as CloudTargetType, target);
	});

	deleteBtn.addEventListener('click', async (e) => {
		e.preventDefault();
		e.stopPropagation();
		if (confirm(getMessage('cloudDeleteConfirm'))) {
			await adapter.delete(target.id);
			await renderCloudTargetList();
		}
	});

	return item;
}
