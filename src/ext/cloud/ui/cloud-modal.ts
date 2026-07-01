/**
 * Cloud Editor Modal
 * Modal for editing cloud target configurations
 */

import { getMessage } from '../../../utils/i18n';
import { showModal, hideModal } from '../../../utils/modal-utils';
import { initializeIcons } from '../../../icons/icons';
import { createElementWithClass } from '../../../utils/dom-utils';
import { CloudTarget, CloudTargetType } from '../types';
import { ALL_TARGETS, testCloudConnection } from '../upload';
import { generateId, setSecret } from '../adapters/base';

/**
 * Open cloud editor modal
 */
export function openCloudEditorModal(targetType?: CloudTargetType, existingConfig?: CloudTarget): void {
	// Remove existing modal if present
	const existingModal = document.getElementById('cloud-editor-modal');
	if (existingModal) {
		existingModal.remove();
	}

	const isEditing = existingConfig !== undefined;
	const initialType = targetType || 'gitRepo';

	// Create modal
	const modal = document.createElement('div');
	modal.id = 'cloud-editor-modal';
	modal.className = 'modal-container';

	modal.innerHTML = `
		<div class="modal-bg"></div>
		<div class="modal">
			<div class="modal-header">
				<div class="modal-title" data-i18n="cloudEditorTitle">Cloud Target Editor</div>
			</div>
			<div class="modal-content">
				<form id="cloud-editor-form">
					<div class="setting-item">
						<label data-i18n="cloudType">Type</label>
						<select id="cloud-type-select" class="dropdown">
							${ALL_TARGETS.map(adapter => `
								<option value="${adapter.type}" ${adapter.type === initialType ? 'selected' : ''}>
									${adapter.typeLabel}
								</option>
							`).join('')}
						</select>
					</div>
					<div id="cloud-fields-container"></div>
				</form>
			</div>
			<div class="modal-button-container">
				<button class="cloud-save-btn mod-cta" data-i18n="save">Save</button>
				<button class="cloud-test-btn" data-i18n="cloudTest">Test connection</button>
				${isEditing ? '<button class="cloud-delete-btn mod-warning" data-i18n="delete">Delete</button>' : ''}
				<button class="cloud-cancel-btn" data-i18n="cancel">Cancel</button>
			</div>
		</div>
	`;

	document.body.appendChild(modal);

	// Render type-specific fields
	renderTypeFields(initialType, existingConfig);

	// Event binding
	bindModalEvents(modal, existingConfig);

	initializeIcons(modal);
	showModal(modal);
}

/**
 * Render type-specific fields
 */
function renderTypeFields(type: CloudTargetType, existingConfig?: CloudTarget): void {
	const container = document.getElementById('cloud-fields-container');
	if (!container) return;

	container.innerHTML = getFieldsHTML(type, existingConfig);
}

/**
 * Get type-specific fields HTML
 */
function getFieldsHTML(type: CloudTargetType, config?: CloudTarget): string {
	const isEditing = config !== undefined;

	switch (type) {
		case 'gitRepo':
			const gitConfig = config as any;
			return `
				<div class="setting-item">
					<label data-i18n="cloudLabelName">Name</label>
					<input type="text" id="cloud-name" value="${gitConfig?.name || ''}" placeholder="My Git Repo" />
				</div>
				<div class="setting-item">
					<label data-i18n="cloudLabelProvider">Provider</label>
					<select id="cloud-provider" class="dropdown">
						<option value="github" ${gitConfig?.provider === 'github' ? 'selected' : ''}>GitHub</option>
						<option value="gitee" ${gitConfig?.provider === 'gitee' ? 'selected' : ''}>Gitee</option>
					</select>
				</div>
				<div class="setting-item">
					<label data-i18n="cloudLabelOwner">Owner</label>
					<input type="text" id="cloud-owner" value="${gitConfig?.owner || ''}" placeholder="Username or org" />
				</div>
				<div class="setting-item">
					<label data-i18n="cloudLabelRepo">Repository</label>
					<input type="text" id="cloud-repo" value="${gitConfig?.repo || ''}" placeholder="Repository name" />
				</div>
				<div class="setting-item">
					<label data-i18n="cloudLabelBranch">Branch</label>
					<input type="text" id="cloud-branch" value="${gitConfig?.branch || 'main'}" placeholder="main" />
				</div>
				<div class="setting-item">
					<label data-i18n="cloudLabelPath">Default path</label>
					<input type="text" id="cloud-path" value="${gitConfig?.defaultPath || ''}" placeholder="notes" />
				</div>
				<div class="setting-item">
					<label data-i18n="cloudLabelToken">Token</label>
					<input type="password" id="cloud-token" placeholder="${isEditing ? '(unchanged)' : 'Personal access token'}" />
				</div>
			`;

		case 'webdav':
			const webdavConfig = config as any;
			return `
				<div class="setting-item">
					<label data-i18n="cloudLabelName">Name</label>
					<input type="text" id="cloud-name" value="${webdavConfig?.name || ''}" placeholder="My WebDAV" />
				</div>
				<div class="setting-item">
					<label data-i18n="cloudLabelUrl">URL</label>
					<input type="text" id="cloud-url" value="${webdavConfig?.url || ''}" placeholder="https://webdav.example.com" />
				</div>
				<div class="setting-item">
					<label data-i18n="cloudLabelUsername">Username</label>
					<input type="text" id="cloud-username" value="${webdavConfig?.username || ''}" placeholder="Username" />
				</div>
				<div class="setting-item">
					<label data-i18n="cloudLabelPath">Default path</label>
					<input type="text" id="cloud-path" value="${webdavConfig?.defaultPath || ''}" placeholder="notes" />
				</div>
				<div class="setting-item">
					<label data-i18n="cloudLabelToken">Password</label>
					<input type="password" id="cloud-token" placeholder="${isEditing ? '(unchanged)' : 'Password'}" />
				</div>
			`;

		case 's3':
			const s3Config = config as any;
			return `
				<div class="setting-item">
					<label data-i18n="cloudLabelName">Name</label>
					<input type="text" id="cloud-name" value="${s3Config?.name || ''}" placeholder="My S3" />
				</div>
				<div class="setting-item">
					<label data-i18n="cloudLabelEndpoint">Endpoint</label>
					<input type="text" id="cloud-endpoint" value="${s3Config?.endpoint || ''}" placeholder="https://s3.amazonaws.com" />
				</div>
				<div class="setting-item">
					<label data-i18n="cloudLabelBucket">Bucket</label>
					<input type="text" id="cloud-bucket" value="${s3Config?.bucket || ''}" placeholder="Bucket name" />
				</div>
				<div class="setting-item">
					<label data-i18n="cloudLabelRegion">Region</label>
					<input type="text" id="cloud-region" value="${s3Config?.region || 'us-east-1'}" placeholder="us-east-1" />
				</div>
				<div class="setting-item">
					<label data-i18n="cloudLabelPathStyle">Path-style URL</label>
					<div class="checkbox-container">
						<input type="checkbox" id="cloud-path-style" ${s3Config?.pathStyle !== false ? 'checked' : ''} />
					</div>
				</div>
				<div class="setting-item">
					<label data-i18n="cloudLabelPath">Default path</label>
					<input type="text" id="cloud-path" value="${s3Config?.defaultPath || ''}" placeholder="notes" />
				</div>
				<div class="setting-item">
					<label data-i18n="cloudLabelAccessKey">Access Key</label>
					<input type="text" id="cloud-access-key" placeholder="${isEditing ? '(unchanged)' : 'Access key ID'}" />
				</div>
				<div class="setting-item">
					<label data-i18n="cloudLabelSecretKey">Secret Key</label>
					<input type="password" id="cloud-secret-key" placeholder="${isEditing ? '(unchanged)' : 'Secret access key'}" />
				</div>
			`;

		case 'fastNote':
			const fastNoteConfig = config as any;
			return `
				<div class="setting-item">
					<label data-i18n="cloudLabelName">Name</label>
					<input type="text" id="cloud-name" value="${fastNoteConfig?.name || ''}" placeholder="My Fast Note" />
				</div>
				<div class="setting-item">
					<label data-i18n="cloudLabelEndpoint">Endpoint</label>
					<input type="text" id="cloud-endpoint" value="${fastNoteConfig?.endpoint || ''}" placeholder="https://fastnote.example.com" />
				</div>
				<div class="setting-item">
					<label data-i18n="cloudLabelUsername">Username</label>
					<input type="text" id="cloud-username" value="${fastNoteConfig?.username || ''}" placeholder="Username" />
				</div>
				<div class="setting-item">
					<label data-i18n="cloudLabelNoteId">Note ID</label>
					<input type="text" id="cloud-note-id" value="${fastNoteConfig?.noteId || ''}" placeholder="(optional)" />
				</div>
				<div class="setting-item">
					<label data-i18n="cloudLabelPath">Default path</label>
					<input type="text" id="cloud-path" value="${fastNoteConfig?.defaultPath || ''}" placeholder="notes" />
				</div>
				<div class="setting-item">
					<label data-i18n="cloudLabelToken">Password</label>
					<input type="password" id="cloud-token" placeholder="${isEditing ? '(unchanged)' : 'Password'}" />
				</div>
			`;

		default:
			return '';
	}
}

/**
 * Bind modal events
 */
function bindModalEvents(modal: HTMLElement, existingConfig?: CloudTarget): void {
	const typeSelect = modal.querySelector('#cloud-type-select') as HTMLSelectElement;
	if (typeSelect) {
		typeSelect.addEventListener('change', () => {
			renderTypeFields(typeSelect.value as CloudTargetType, existingConfig);
		});
	}

	const saveBtn = modal.querySelector('.cloud-save-btn');
	if (saveBtn) {
		saveBtn.addEventListener('click', async () => {
			await handleSave(modal, existingConfig);
		});
	}

	const testBtn = modal.querySelector('.cloud-test-btn');
	if (testBtn) {
		testBtn.addEventListener('click', async () => {
			await handleTest(modal);
		});
	}

	const deleteBtn = modal.querySelector('.cloud-delete-btn');
	if (deleteBtn && existingConfig) {
		deleteBtn.addEventListener('click', async () => {
			const adapter = ALL_TARGETS.find(a => a.type === existingConfig.type);
			if (adapter) {
				await adapter.delete(existingConfig.id);
				hideModal(modal);
				modal.remove();
				// Re-render list
				const { renderCloudTargetList } = await import('./cloud-settings');
				await renderCloudTargetList();
			}
		});
	}

	const cancelBtn = modal.querySelector('.cloud-cancel-btn');
	if (cancelBtn) {
		cancelBtn.addEventListener('click', () => {
			hideModal(modal);
			modal.remove();
		});
	}
}

/**
 * Handle save button
 */
async function handleSave(modal: HTMLElement, existingConfig?: CloudTarget): Promise<void> {
	const typeSelect = modal.querySelector('#cloud-type-select') as HTMLSelectElement;
	const type = typeSelect.value as CloudTargetType;

	const adapter = ALL_TARGETS.find(a => a.type === type);
	if (!adapter) return;

	// Collect form data
	const config = collectFormData(type, existingConfig);

	// Validate
	const error = adapter.validate(config);
	if (error) {
		alert(getMessage(error));
		return;
	}

	// Save config
	await adapter.save(config);

	// Save secret if provided
	const secretValue = getSecretFromForm(type, modal);
	if (secretValue) {
		await setSecret(adapter.secretPrefix, config.id, secretValue);
	}

	hideModal(modal);
	modal.remove();

	// Re-render list
	const { renderCloudTargetList } = await import('./cloud-settings');
	await renderCloudTargetList();
}

/**
 * Handle test button
 */
async function handleTest(modal: HTMLElement): Promise<void> {
	const typeSelect = modal.querySelector('#cloud-type-select') as HTMLSelectElement;
	const type = typeSelect.value as CloudTargetType;

	const adapter = ALL_TARGETS.find(a => a.type === type);
	if (!adapter) return;

	const testBtn = modal.querySelector('.cloud-test-btn') as HTMLButtonElement;
	if (testBtn) {
		testBtn.textContent = getMessage('cloudTesting') || 'Testing...';
		testBtn.disabled = true;
	}

	// Collect form data with temporary ID for testing
	const config = collectFormData(type);

	// Get secret
	const secretValue = getSecretFromForm(type, modal);
	if (!secretValue) {
		alert(getMessage('cloudTokenRequired') || 'Token/Password required for testing');
		testBtn.textContent = getMessage('cloudTest') || 'Test connection';
		testBtn.disabled = false;
		return;
	}

	// Temporarily set secret for testing
	await setSecret(adapter.secretPrefix, config.id, secretValue);

	const success = await testCloudConnection(config);

	// Clean up temporary secret
	await setSecret(adapter.secretPrefix, config.id, '');

	testBtn.textContent = getMessage('cloudTest') || 'Test connection';
	testBtn.disabled = false;

	if (success) {
		alert(getMessage('cloudTestSuccess') || 'Connection successful');
	} else {
		alert(getMessage('cloudTestFailed') || 'Connection failed');
	}
}

/**
 * Collect form data into config object
 */
function collectFormData(type: CloudTargetType, existingConfig?: CloudTarget): CloudTarget {
	const nameInput = document.getElementById('cloud-name') as HTMLInputElement;
	const pathInput = document.getElementById('cloud-path') as HTMLInputElement;

	const id = existingConfig?.id || generateId();
	const name = nameInput?.value || '';

	switch (type) {
		case 'gitRepo':
			const providerSelect = document.getElementById('cloud-provider') as HTMLSelectElement;
			const ownerInput = document.getElementById('cloud-owner') as HTMLInputElement;
			const repoInput = document.getElementById('cloud-repo') as HTMLInputElement;
			const branchInput = document.getElementById('cloud-branch') as HTMLInputElement;

			return {
				type: 'gitRepo',
				id,
				name,
				provider: providerSelect?.value as 'github' | 'gitee',
				owner: ownerInput?.value || '',
				repo: repoInput?.value || '',
				branch: branchInput?.value || 'main',
				defaultPath: pathInput?.value || undefined
			};

		case 'webdav':
			const urlInput = document.getElementById('cloud-url') as HTMLInputElement;
			const usernameInput = document.getElementById('cloud-username') as HTMLInputElement;

			return {
				type: 'webdav',
				id,
				name,
				url: urlInput?.value || '',
				username: usernameInput?.value || '',
				defaultPath: pathInput?.value || undefined
			};

		case 's3':
			const endpointInput = document.getElementById('cloud-endpoint') as HTMLInputElement;
			const bucketInput = document.getElementById('cloud-bucket') as HTMLInputElement;
			const regionInput = document.getElementById('cloud-region') as HTMLInputElement;
			const pathStyleInput = document.getElementById('cloud-path-style') as HTMLInputElement;

			return {
				type: 's3',
				id,
				name,
				endpoint: endpointInput?.value || '',
				bucket: bucketInput?.value || '',
				region: regionInput?.value || 'us-east-1',
				pathStyle: pathStyleInput?.checked ?? true,
				defaultPath: pathInput?.value || undefined
			};

		case 'fastNote':
			const fnEndpointInput = document.getElementById('cloud-endpoint') as HTMLInputElement;
			const fnUsernameInput = document.getElementById('cloud-username') as HTMLInputElement;
			const noteIdInput = document.getElementById('cloud-note-id') as HTMLInputElement;

			return {
				type: 'fastNote',
				id,
				name,
				endpoint: fnEndpointInput?.value || '',
				username: fnUsernameInput?.value || '',
				noteId: noteIdInput?.value || undefined,
				defaultPath: pathInput?.value || undefined
			};

		default:
			throw new Error(`Unknown type: ${type}`);
	}
}

/**
 * Get secret value from form
 */
function getSecretFromForm(type: CloudTargetType, modal: HTMLElement): string {
	switch (type) {
		case 'gitRepo':
			const tokenInput = modal.querySelector('#cloud-token') as HTMLInputElement;
			return tokenInput?.value || '';

		case 'webdav':
			const passwordInput = modal.querySelector('#cloud-token') as HTMLInputElement;
			return passwordInput?.value || '';

		case 's3':
			const accessKeyInput = modal.querySelector('#cloud-access-key') as HTMLInputElement;
			const secretKeyInput = modal.querySelector('#cloud-secret-key') as HTMLInputElement;
			const accessKey = accessKeyInput?.value || '';
			const secretKey = secretKeyInput?.value || '';
			return accessKey && secretKey ? `${accessKey}:${secretKey}` : '';

		case 'fastNote':
			const fnPasswordInput = modal.querySelector('#cloud-token') as HTMLInputElement;
			return fnPasswordInput?.value || '';

		default:
			return '';
	}
}