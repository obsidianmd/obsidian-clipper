/**
 * Upload dispatcher for cloud storage
 * Routes upload requests to the appropriate adapter
 */

import { CloudTarget, UploadRequest, UploadResult, RemoteTarget } from './types';
import { gitRepoTarget } from './adapters/git-repo';
import { webdavTarget } from './adapters/webdav';
import { s3Target } from './adapters/s3';
import { fastNoteTarget } from './adapters/fast-note';
import { siyuanTarget } from './adapters/siyuan';
import { getSecret } from './adapters/base';
import { sanitizeFileName } from '../../utils/string-utils';

// All available targets
export const ALL_TARGETS: RemoteTarget[] = [
	gitRepoTarget,
	webdavTarget,
	s3Target,
	fastNoteTarget,
	siyuanTarget
];

/**
 * Get the active cloud target
 */
export async function getActiveCloudTarget(): Promise<{ target: CloudTarget; adapter: RemoteTarget } | null> {
	for (const adapter of ALL_TARGETS) {
		const activeId = await adapter.getActiveId();
		if (activeId) {
			const list = await adapter.list();
			const target = list.find(t => t.id === activeId);
			if (target) {
				return { target, adapter };
			}
		}
	}
	return null;
}

/**
 * Execute upload to cloud storage
 */
export async function executeRemoteUpload(request: UploadRequest): Promise<UploadResult> {
	try {
		const activeTarget = await getActiveCloudTarget();

		if (!activeTarget) {
			return {
				success: false,
				error: 'cloudNoActiveTarget'
			};
		}

		const { target, adapter } = activeTarget;

		// Get secret
		const secret = await getSecret(adapter.secretPrefix, target.id);

		// Create client
		const client = adapter.createClient(target, secret);

		// Build path - concatenate cloud target default path with template path
		const cloudPath = target.defaultPath || '';
		const templatePath = request.template.path || '';
		const basePath = cloudPath && templatePath ? `${cloudPath}/${templatePath}` : cloudPath || templatePath;
		const fileName = sanitizeFileName(request.title) + '.md';
		const path = basePath ? `${basePath}/${fileName}` : fileName;

		// Get upload mode
		const mode = adapter.mapBehaviorToMode(request.template.behavior);

		// Execute upload
		await client.upload(path, request.content, mode);

		return {
			success: true,
			path
		};
	} catch (error) {
		console.error('Cloud upload error:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'cloudSaveFailed'
		};
	}
}

/**
 * Test connection for a specific target
 */
export async function testCloudConnection(config: CloudTarget): Promise<boolean> {
	const adapter = ALL_TARGETS.find(a => a.type === config.type);
	if (!adapter) {
		return false;
	}

	return await adapter.testConnection(config);
}