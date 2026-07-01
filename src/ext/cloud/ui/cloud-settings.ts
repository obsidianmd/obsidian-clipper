/**
 * Cloud Settings UI
 * Renders cloud storage section in Settings page
 */

import { getMessage } from '../../../utils/i18n';
import { initializeIcons } from '../../../icons/icons';
import { createElementWithClass } from '../../../utils/dom-utils';
import { ALL_TARGETS } from '../upload';
import { CloudTarget, CloudTargetType } from '../types';
import { setActiveTargetId, generateId, setSecret } from '../adapters/base';
import { openCloudEditorModal } from './cloud-modal';

/**
 * Mount cloud settings section into DOM
 */
export function mountCloudSettings(): void {
	const container = document.getElementById('cloud-section');
	if (!container) return;

	// Render section header
	container.innerHTML = `
		<div class="settings-section-header">
			<h2 data-i18n="cloudSettings">Cloud Storage</h2>
		</div>
		<div class="setting-group">
			<div class="setting-items">
				<div class="setting-item mod-horizontal">
					<div class="setting-item-info">
						<label for="cloud-active-target" data-i18n="cloudActiveTarget">Active cloud target</label>
						<div class="setting-item-description" data-i18n="cloudActiveTargetDescription">
							Select the cloud storage target to use for saving notes.
						</div>
					</div>
					<div class="setting-item-control">
						<select id="cloud-active-target" class="dropdown">
							<option value="">—</option>
						</select>
					</div>
				</div>
			</div>
			<div id="cloud-target-list"></div>
			<button type="button" id="add-cloud-target-btn" class="mod-cta">
				<span data-i18n="cloudAddTarget">+ Add cloud target</span>
			</button>
		</div>
	`;

	// Event binding
	bindCloudEvents();
	renderCloudTargetList();
	initializeIcons(container);
}

/**
 * Bind cloud settings events
 */
function bindCloudEvents(): void {
	const addBtn = document.getElementById('add-cloud-target-btn');
	if (addBtn) {
		addBtn.addEventListener('click', () => {
			openCloudEditorModal();
		});
	}

	const activeTargetSelect = document.getElementById('cloud-active-target') as HTMLSelectElement;
	if (activeTargetSelect) {
		activeTargetSelect.addEventListener('change', async () => {
			const value = activeTargetSelect.value;
			if (!value) {
				// Clear all active IDs
				for (const adapter of ALL_TARGETS) {
					await setActiveTargetId(adapter.activeIdKey, null);
				}
			} else {
				const [type, id] = value.split(':');
				const adapter = ALL_TARGETS.find(a => a.type === type);
				if (adapter) {
					await setActiveTargetId(adapter.activeIdKey, id);
					// Clear other active IDs
					for (const otherAdapter of ALL_TARGETS) {
						if (otherAdapter.type !== type) {
							await setActiveTargetId(otherAdapter.activeIdKey, null);
						}
					}
				}
			}
		});
	}
}

/**
 * Render cloud target list
 */
export async function renderCloudTargetList(): Promise<void> {
	const listContainer = document.getElementById('cloud-target-list');
	if (!listContainer) return;

	listContainer.textContent = '';

	// Collect all targets
	const allTargets: { target: CloudTarget; adapter: typeof ALL_TARGETS[0] }[] = [];

	for (const adapter of ALL_TARGETS) {
		const list = await adapter.list();
		for (const target of list) {
			allTargets.push({ target, adapter });
		}
	}

	// Update active target dropdown
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

		// Set current active
		for (const adapter of ALL_TARGETS) {
			const activeId = await adapter.getActiveId();
			if (activeId) {
				activeTargetSelect.value = `${adapter.type}:${activeId}`;
				break;
			}
		}
	}

	// Render list items
	for (const { target, adapter } of allTargets) {
		const item = createElementWithClass('div', 'setting-item mod-horizontal');

		item.innerHTML = `
			<div class="setting-item-info">
				<label>${target.name}</label>
				<div class="setting-item-description">${adapter.typeLabel}</div>
			</div>
			<div class="setting-item-control">
				<button class="cloud-edit-btn" data-id="${target.id}" data-type="${adapter.type}">
					<span data-i18n="edit">Edit</span>
				</button>
				<button class="cloud-delete-btn mod-warning" data-id="${target.id}" data-type="${adapter.type}">
					<span data-i18n="delete">Delete</span>
				</button>
			</div>
		`;

		// Edit button
		const editBtn = item.querySelector('.cloud-edit-btn');
		if (editBtn) {
			editBtn.addEventListener('click', () => {
				openCloudEditorModal(adapter.type as CloudTargetType, target);
			});
		}

		// Delete button
		const deleteBtn = item.querySelector('.cloud-delete-btn');
		if (deleteBtn) {
			deleteBtn.addEventListener('click', async () => {
				if (confirm(getMessage('cloudDeleteConfirm'))) {
					await adapter.delete(target.id);
					await renderCloudTargetList();
				}
			});
		}

		listContainer.appendChild(item);
	}

	initializeIcons(listContainer);
}