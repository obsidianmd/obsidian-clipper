/**
 * Cloud Editor Modal
 * Modal for editing cloud target configurations
 */

import { getMessage, translatePage } from '../../../utils/i18n';
import { showModal, hideModal } from '../../../utils/modal-utils';
import { initializeIcons } from '../../../icons/icons';
import { CloudTarget, CloudTargetType } from '../types';
import { ALL_TARGETS, testCloudConnection } from '../upload';
import { generateId, setSecret } from '../adapters/base';
import { renderCloudTargetList } from './cloud-settings';

let editingTarget: CloudTarget | null = null;
let isEditing = false;

/**
 * Open cloud editor modal
 */
export function openCloudEditorModal(targetType?: CloudTargetType, existingConfig?: CloudTarget): void {
	const modal = document.getElementById('cloud-modal');
	if (!modal) return;

	editingTarget = existingConfig || null;
	isEditing = existingConfig !== undefined;

	const titleElement = modal.querySelector('.modal-title');
	if (titleElement) {
		titleElement.setAttribute('data-i18n', isEditing ? 'cloudEditTarget' : 'cloudAddTarget');
	}

	const typeSelect = document.getElementById('cloud-type') as HTMLSelectElement;
	const nameInput = document.getElementById('cloud-name') as HTMLInputElement;
	const typeFieldsContainer = document.getElementById('cloud-type-fields');

	if (!typeSelect || !nameInput || !typeFieldsContainer) return;

	typeSelect.textContent = '';
	ALL_TARGETS.forEach(adapter => {
		const option = document.createElement('option');
		option.value = adapter.type;
		option.textContent = adapter.typeLabel;
		typeSelect.appendChild(option);
	});

	const initialType = existingConfig?.type || targetType || ALL_TARGETS[0].type;
	typeSelect.value = initialType;

	if (existingConfig) {
		nameInput.value = existingConfig.name || '';
	} else {
		nameInput.value = '';
	}

	renderTypeFields(initialType, existingConfig);

	typeSelect.onchange = () => {
		renderTypeFields(typeSelect.value as CloudTargetType);
	};

	const saveBtn = modal.querySelector('.cloud-save-btn');
	const testBtn = modal.querySelector('.cloud-test-btn');
	const cancelBtn = modal.querySelector('.cloud-cancel-btn');

	const newSaveBtn = saveBtn?.cloneNode(true);
	const newTestBtn = testBtn?.cloneNode(true);
	const newCancelBtn = cancelBtn?.cloneNode(true);

	if (saveBtn && newSaveBtn) {
		saveBtn.parentNode?.replaceChild(newSaveBtn, saveBtn);
	}
	if (testBtn && newTestBtn) {
		testBtn.parentNode?.replaceChild(newTestBtn, testBtn);
	}
	if (cancelBtn && newCancelBtn) {
		cancelBtn.parentNode?.replaceChild(newCancelBtn, cancelBtn);
	}

	newSaveBtn?.addEventListener('click', async () => {
		await handleSave();
	});

	newTestBtn?.addEventListener('click', async () => {
		await handleTest();
	});

	newCancelBtn?.addEventListener('click', () => {
		hideModal(modal);
	});

	translatePage();
	initializeIcons(modal);
	showModal(modal);
}

function renderTypeFields(type: CloudTargetType, existingConfig?: CloudTarget): void {
	const container = document.getElementById('cloud-type-fields');
	if (!container) return;

	const isEditing = existingConfig !== undefined;
	const config: any = existingConfig || {};

	switch (type) {
		case 'gitRepo':
			container.innerHTML = `
				<div class="setting-item">
					<div class="setting-item-info">
						<label for="cloud-provider" data-i18n="cloudLabelProvider">Provider</label>
						<div class="setting-item-description" data-i18n="cloudProviderDescription">Git hosting provider.</div>
					</div>
					<div class="setting-item-control">
						<select id="cloud-provider" class="dropdown">
							<option value="github" ${config.provider === 'github' ? 'selected' : ''}>GitHub</option>
							<option value="gitee" ${config.provider === 'gitee' ? 'selected' : ''}>Gitee</option>
						</select>
					</div>
				</div>
				<div class="setting-item">
					<div class="setting-item-info">
						<label for="cloud-owner" data-i18n="cloudLabelOwner">Owner</label>
						<div class="setting-item-description" data-i18n="cloudOwnerDescription">Username or organization name.</div>
					</div>
					<div class="setting-item-control">
						<input type="text" id="cloud-owner" value="${config.owner || ''}" placeholder="username" />
					</div>
				</div>
				<div class="setting-item">
					<div class="setting-item-info">
						<label for="cloud-repo" data-i18n="cloudLabelRepo">Repository</label>
						<div class="setting-item-description" data-i18n="cloudRepoDescription">Repository name.</div>
					</div>
					<div class="setting-item-control">
						<input type="text" id="cloud-repo" value="${config.repo || ''}" placeholder="my-notes" />
					</div>
				</div>
				<div class="setting-item">
					<div class="setting-item-info">
						<label for="cloud-branch" data-i18n="cloudLabelBranch">Branch</label>
						<div class="setting-item-description" data-i18n="cloudBranchDescription">Branch to save notes to.</div>
					</div>
					<div class="setting-item-control">
						<input type="text" id="cloud-branch" value="${config.branch || 'main'}" placeholder="main" />
					</div>
				</div>
				<div class="setting-item">
					<div class="setting-item-info">
						<label for="cloud-path" data-i18n="cloudLabelPath">Default path</label>
						<div class="setting-item-description" data-i18n="cloudPathDescription">Default directory for saved notes.</div>
					</div>
					<div class="setting-item-control">
						<input type="text" id="cloud-path" value="${config.defaultPath || ''}" placeholder="notes" />
					</div>
				</div>
				<div class="setting-item">
					<div class="setting-item-info">
						<label for="cloud-token" data-i18n="cloudLabelToken">Token</label>
						<div class="setting-item-description" data-i18n="cloudTokenDescription">Personal access token with repo access.</div>
					</div>
					<div class="setting-item-control">
						<input type="password" id="cloud-token" placeholder="${isEditing ? '(unchanged)' : 'Personal access token'}" />
					</div>
				</div>
			`;
			break;

		case 'webdav':
			container.innerHTML = `
				<div class="setting-item">
					<div class="setting-item-info">
						<label for="cloud-url" data-i18n="cloudLabelUrl">URL</label>
						<div class="setting-item-description" data-i18n="cloudUrlDescription">WebDAV server URL.</div>
					</div>
					<div class="setting-item-control">
						<input type="text" id="cloud-url" value="${config.url || ''}" placeholder="https://webdav.example.com" />
					</div>
				</div>
				<div class="setting-item">
					<div class="setting-item-info">
						<label for="cloud-username" data-i18n="cloudLabelUsername">Username</label>
						<div class="setting-item-description" data-i18n="cloudUsernameDescription">WebDAV username.</div>
					</div>
					<div class="setting-item-control">
						<input type="text" id="cloud-username" value="${config.username || ''}" placeholder="username" />
					</div>
				</div>
				<div class="setting-item">
					<div class="setting-item-info">
						<label for="cloud-path" data-i18n="cloudLabelPath">Default path</label>
						<div class="setting-item-description" data-i18n="cloudPathDescription">Default directory for saved notes.</div>
					</div>
					<div class="setting-item-control">
						<input type="text" id="cloud-path" value="${config.defaultPath || ''}" placeholder="notes" />
					</div>
				</div>
				<div class="setting-item">
					<div class="setting-item-info">
						<label for="cloud-token" data-i18n="cloudLabelPassword">Password</label>
						<div class="setting-item-description" data-i18n="cloudPasswordDescription">WebDAV password.</div>
					</div>
					<div class="setting-item-control">
						<input type="password" id="cloud-token" placeholder="${isEditing ? '(unchanged)' : 'Password'}" />
					</div>
				</div>
			`;
			break;

		case 's3':
			container.innerHTML = `
				<div class="setting-item">
					<div class="setting-item-info">
						<label for="cloud-endpoint" data-i18n="cloudLabelEndpoint">Endpoint</label>
						<div class="setting-item-description" data-i18n="cloudEndpointDescription">S3-compatible endpoint URL.</div>
					</div>
					<div class="setting-item-control">
						<input type="text" id="cloud-endpoint" value="${config.endpoint || ''}" placeholder="https://s3.amazonaws.com" />
					</div>
				</div>
				<div class="setting-item">
					<div class="setting-item-info">
						<label for="cloud-bucket" data-i18n="cloudLabelBucket">Bucket</label>
						<div class="setting-item-description" data-i18n="cloudBucketDescription">S3 bucket name.</div>
					</div>
					<div class="setting-item-control">
						<input type="text" id="cloud-bucket" value="${config.bucket || ''}" placeholder="my-bucket" />
					</div>
				</div>
				<div class="setting-item">
					<div class="setting-item-info">
						<label for="cloud-region" data-i18n="cloudLabelRegion">Region</label>
						<div class="setting-item-description" data-i18n="cloudRegionDescription">S3 region.</div>
					</div>
					<div class="setting-item-control">
						<input type="text" id="cloud-region" value="${config.region || 'us-east-1'}" placeholder="us-east-1" />
					</div>
				</div>
				<div class="setting-item">
					<div class="setting-item-info">
						<label for="cloud-path-style" data-i18n="cloudLabelPathStyle">Path-style URL</label>
						<div class="setting-item-description" data-i18n="cloudPathStyleDescription">Use path-style URLs instead of virtual-hosted style.</div>
					</div>
					<div class="setting-item-control">
						<div class="checkbox-container">
							<input type="checkbox" id="cloud-path-style" ${config.pathStyle !== false ? 'checked' : ''} />
						</div>
					</div>
				</div>
				<div class="setting-item">
					<div class="setting-item-info">
						<label for="cloud-path" data-i18n="cloudLabelPath">Default path</label>
						<div class="setting-item-description" data-i18n="cloudPathDescription">Default directory for saved notes.</div>
					</div>
					<div class="setting-item-control">
						<input type="text" id="cloud-path" value="${config.defaultPath || ''}" placeholder="notes" />
					</div>
				</div>
				<div class="setting-item">
					<div class="setting-item-info">
						<label for="cloud-access-key" data-i18n="cloudLabelAccessKey">Access Key</label>
						<div class="setting-item-description" data-i18n="cloudAccessKeyDescription">S3 access key ID.</div>
					</div>
					<div class="setting-item-control">
						<input type="text" id="cloud-access-key" placeholder="${isEditing ? '(unchanged)' : 'Access key ID'}" />
					</div>
				</div>
				<div class="setting-item">
					<div class="setting-item-info">
						<label for="cloud-secret-key" data-i18n="cloudLabelSecretKey">Secret Key</label>
						<div class="setting-item-description" data-i18n="cloudSecretKeyDescription">S3 secret access key.</div>
					</div>
					<div class="setting-item-control">
						<input type="password" id="cloud-secret-key" placeholder="${isEditing ? '(unchanged)' : 'Secret access key'}" />
					</div>
				</div>
			`;
			break;

		case 'fastNote':
			container.innerHTML = `
				<div class="setting-item">
					<div class="setting-item-info">
						<label for="cloud-endpoint" data-i18n="cloudLabelEndpoint">Endpoint</label>
						<div class="setting-item-description" data-i18n="cloudEndpointDescription">Fast Note Sync server URL.</div>
					</div>
					<div class="setting-item-control">
						<input type="text" id="cloud-endpoint" value="${config.endpoint || ''}" placeholder="https://fastnote.example.com" />
					</div>
				</div>
				<div class="setting-item">
					<div class="setting-item-info">
						<label for="cloud-username" data-i18n="cloudLabelUsername">Username</label>
						<div class="setting-item-description" data-i18n="cloudUsernameDescription">Fast Note username.</div>
					</div>
					<div class="setting-item-control">
						<input type="text" id="cloud-username" value="${config.username || ''}" placeholder="username" />
					</div>
				</div>
				<div class="setting-item">
					<div class="setting-item-info">
						<label for="cloud-note-id" data-i18n="cloudLabelNoteId">Note ID</label>
						<div class="setting-item-description" data-i18n="cloudNoteIdDescription">Target note ID (optional).</div>
					</div>
					<div class="setting-item-control">
						<input type="text" id="cloud-note-id" value="${config.noteId || ''}" placeholder="note-id" />
					</div>
				</div>
				<div class="setting-item">
					<div class="setting-item-info">
						<label for="cloud-token" data-i18n="cloudLabelPassword">Password</label>
						<div class="setting-item-description" data-i18n="cloudPasswordDescription">Fast Note password.</div>
					</div>
					<div class="setting-item-control">
						<input type="password" id="cloud-token" placeholder="${isEditing ? '(unchanged)' : 'Password'}" />
					</div>
				</div>
			`;
			break;
	}

	translatePage();
	initializeIcons(container);
}

function collectFormData(): { config: CloudTarget | null; secret: string; error: string | null } {
	const typeSelect = document.getElementById('cloud-type') as HTMLSelectElement;
	const nameInput = document.getElementById('cloud-name') as HTMLInputElement;
	const type = typeSelect?.value as CloudTargetType;
	const name = nameInput?.value?.trim();

	if (!name) {
		return { config: null, secret: '', error: getMessage('cloudNameRequired') || 'Name is required' };
	}

	const id = editingTarget?.id || generateId();
	const defaultPathInput = document.getElementById('cloud-path') as HTMLInputElement;
	const defaultPath = defaultPathInput?.value?.trim() || undefined;

	let config: CloudTarget | null = null;
	let secret = '';

	switch (type) {
		case 'gitRepo':
			const providerSelect = document.getElementById('cloud-provider') as HTMLSelectElement;
			const ownerInput = document.getElementById('cloud-owner') as HTMLInputElement;
			const repoInput = document.getElementById('cloud-repo') as HTMLInputElement;
			const branchInput = document.getElementById('cloud-branch') as HTMLInputElement;
			const tokenInput = document.getElementById('cloud-token') as HTMLInputElement;

			const provider = providerSelect?.value as 'github' | 'gitee';
			const owner = ownerInput?.value?.trim();
			const repo = repoInput?.value?.trim();
			const branch = branchInput?.value?.trim() || 'main';

			if (!owner || !repo) {
				return { config: null, secret: '', error: getMessage('cloudOwnerRepoRequired') || 'Owner and repository are required' };
			}

			config = {
				type: 'gitRepo',
				id,
				name,
				provider,
				owner,
				repo,
				branch,
				defaultPath
			};
			secret = tokenInput?.value || '';
			break;

		case 'webdav':
			const urlInput = document.getElementById('cloud-url') as HTMLInputElement;
			const usernameInput = document.getElementById('cloud-username') as HTMLInputElement;
			const webdavTokenInput = document.getElementById('cloud-token') as HTMLInputElement;

			const url = urlInput?.value?.trim();
			const username = usernameInput?.value?.trim();

			if (!url) {
				return { config: null, secret: '', error: getMessage('cloudUrlRequired') || 'URL is required' };
			}

			config = {
				type: 'webdav',
				id,
				name,
				url,
				username,
				defaultPath
			};
			secret = webdavTokenInput?.value || '';
			break;

		case 's3':
			const endpointInput = document.getElementById('cloud-endpoint') as HTMLInputElement;
			const bucketInput = document.getElementById('cloud-bucket') as HTMLInputElement;
			const regionInput = document.getElementById('cloud-region') as HTMLInputElement;
			const pathStyleInput = document.getElementById('cloud-path-style') as HTMLInputElement;
			const accessKeyInput = document.getElementById('cloud-access-key') as HTMLInputElement;
			const secretKeyInput = document.getElementById('cloud-secret-key') as HTMLInputElement;

			const endpoint = endpointInput?.value?.trim();
			const bucket = bucketInput?.value?.trim();
			const region = regionInput?.value?.trim() || 'us-east-1';
			const pathStyle = pathStyleInput?.checked ?? true;

			if (!endpoint || !bucket) {
				return { config: null, secret: '', error: getMessage('cloudEndpointBucketRequired') || 'Endpoint and bucket are required' };
			}

			config = {
				type: 's3',
				id,
				name,
				endpoint,
				bucket,
				region,
				pathStyle,
				defaultPath
			};

			const accessKey = accessKeyInput?.value || '';
			const secretKey = secretKeyInput?.value || '';
			secret = accessKey && secretKey ? JSON.stringify({ accessKey, secretKey }) : '';
			break;

		case 'fastNote':
			const fnEndpointInput = document.getElementById('cloud-endpoint') as HTMLInputElement;
			const fnUsernameInput = document.getElementById('cloud-username') as HTMLInputElement;
			const noteIdInput = document.getElementById('cloud-note-id') as HTMLInputElement;
			const fnTokenInput = document.getElementById('cloud-token') as HTMLInputElement;

			const fnEndpoint = fnEndpointInput?.value?.trim();
			const fnUsername = fnUsernameInput?.value?.trim();
			const noteId = noteIdInput?.value?.trim() || undefined;

			if (!fnEndpoint) {
				return { config: null, secret: '', error: getMessage('cloudUrlRequired') || 'URL is required' };
			}

			config = {
				type: 'fastNote',
				id,
				name,
				endpoint: fnEndpoint,
				username: fnUsername,
				noteId,
				defaultPath
			};
			secret = fnTokenInput?.value || '';
			break;
	}

	return { config, secret, error: null };
}

async function handleSave(): Promise<void> {
	const { config, secret, error } = collectFormData();
	if (error || !config) {
		alert(error);
		return;
	}

	const adapter = ALL_TARGETS.find(a => a.type === config.type);
	if (!adapter) return;

	await adapter.save(config);

	if (secret) {
		await setSecret(adapter.secretPrefix, config.id, secret);
	}

	await renderCloudTargetList();

	const modal = document.getElementById('cloud-modal');
	if (modal) hideModal(modal);
}

async function handleTest(): Promise<void> {
	const { config, secret, error } = collectFormData();
	if (error || !config) {
		alert(error);
		return;
	}

	const adapter = ALL_TARGETS.find(a => a.type === config.type);
	if (!adapter) return;

	const testBtn = document.querySelector('.cloud-test-btn') as HTMLButtonElement;
	const originalText = testBtn?.textContent;
	if (testBtn) {
		testBtn.textContent = getMessage('cloudTesting') || 'Testing...';
		testBtn.disabled = true;
	}

	if (secret) {
		await setSecret(adapter.secretPrefix, config.id, secret);
	}

	const success = await testCloudConnection(config);

	if (!secret) {
		await setSecret(adapter.secretPrefix, config.id, '');
	}

	if (testBtn) {
		testBtn.textContent = originalText;
		testBtn.disabled = false;
	}

	if (success) {
		alert(getMessage('cloudTestSuccess') || 'Connection successful');
	} else {
		alert(getMessage('cloudTestFailed') || 'Connection failed');
	}
}
