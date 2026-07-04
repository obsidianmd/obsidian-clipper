/**
 * Self-contained i18n for the cloud storage module.
 *
 * These translations are extracted from
 * `src/_locales/{en,zh_CN}/messages.json` so that the cloud module no longer
 * depends on modifications to the shared locale files. Other locales fall
 * back to English.
 *
 * The locale is resolved at call time from `document.documentElement.lang`,
 * which the main app sets via `setupLanguageAndDirection()`.
 */

const translations: Record<string, Record<string, string>> = {
	en: {
		cloud: 'Cloud',
		cloudSettings: 'Cloud Storage',
		cloudActiveTarget: 'Active cloud target',
		cloudActiveTargetDescription: 'Select the cloud storage target to use for saving notes.',
		cloudAddTarget: '+ Add cloud target',
		cloudEditorTitle: 'Cloud Target Editor',
		cloudType: 'Type',
		cloudTypeDescription: 'Select the cloud storage type.',
		cloudTargets: 'Cloud Targets',
		saveToCloud: 'Save to cloud',
		cloudSaveSuccess: 'Saved to cloud',
		cloudSaveFailed: 'Failed to save to cloud',
		cloudTest: 'Test connection',
		cloudTestSuccess: 'Connection successful',
		cloudTestFailed: 'Connection failed',
		cloudDeleteConfirm: 'Are you sure you want to delete this cloud target?',
		cloudTesting: 'Testing...',
		cloudTokenRequired: 'Token/Password required for testing',
		cloudNoActiveTarget: 'No active cloud target configured',
		cloudLabelName: 'Name',
		cloudNameDescription: 'Display name for this cloud target.',
		cloudLabelToken: 'Token / Password',
		cloudLabelUrl: 'URL',
		cloudLabelUsername: 'Username',
		cloudLabelEndpoint: 'Endpoint',
		cloudLabelBucket: 'Bucket',
		cloudLabelRegion: 'Region',
		cloudLabelPathStyle: 'Path-style URL',
		cloudLabelProvider: 'Provider',
		cloudLabelOwner: 'Owner',
		cloudLabelRepo: 'Repository',
		cloudLabelBranch: 'Branch',
		cloudLabelNoteId: 'Note ID',
		cloudLabelPath: 'Default path',
		cloudLabelAccessKey: 'Access Key',
		cloudLabelSecretKey: 'Secret Key',
		cloudLabelNotebook: 'Notebook',
		cloudProviderDescription: 'Git hosting provider.',
		cloudOwnerDescription: 'Username or organization name.',
		cloudRepoDescription: 'Repository name.',
		cloudBranchDescription: 'Branch to save notes to.',
		cloudPathDescription: 'Default directory for saved notes.',
		cloudTokenDescription: 'Personal access token with repo access.',
		cloudUrlDescription: 'WebDAV server URL.',
		cloudUsernameDescription: 'WebDAV username.',
		cloudPasswordDescription: 'WebDAV password.',
		cloudEndpointDescription: 'S3-compatible endpoint URL.',
		cloudBucketDescription: 'S3 bucket name.',
		cloudRegionDescription: 'S3 region.',
		cloudPathStyleDescription: 'Use path-style URLs instead of virtual-hosted style.',
		cloudAccessKeyDescription: 'S3 access key ID.',
		cloudSecretKeyDescription: 'S3 secret access key.',
		cloudNoteIdDescription: 'Target note ID (optional).',
		cloudNotebookDescription: 'SiYuan notebook name or ID.',
		cloudSiyuanEndpointDescription: 'SiYuan API endpoint, e.g. http://127.0.0.1:6806',
		cloudSiyuanTokenDescription: 'SiYuan API token from Settings → About.',
		cloudEditTarget: 'Edit cloud target',
		cloudNameRequired: 'Name is required',
		cloudOwnerRepoRequired: 'Owner and repository are required',
		cloudUrlRequired: 'URL is required',
		cloudEndpointBucketRequired: 'Endpoint and bucket are required',
		cloudEndpointRequired: 'Endpoint is required',
		cloudNotebookRequired: 'Notebook is required',
		cloudGitRepoErrorProvider: 'Provider is required',
		cloudGitRepoErrorOwner: 'Owner is required',
		cloudGitRepoErrorRepo: 'Repository is required',
		cloudGitRepoErrorBranch: 'Branch is required',
		cloudWebdavErrorUrl: 'URL is required',
		cloudWebdavErrorUsername: 'Username is required',
		cloudS3ErrorEndpoint: 'Endpoint is required',
		cloudS3ErrorBucket: 'Bucket is required',
		cloudS3ErrorRegion: 'Region is required',
		cloudFastNoteErrorEndpoint: 'Endpoint is required',
		cloudFastNoteErrorUsername: 'Username is required',
		cloudSiyuanErrorEndpoint: 'Endpoint is required',
		cloudSiyuanErrorToken: 'Token is required',
		cloudSiyuanErrorNotebook: 'Notebook is required',
		// Shared keys used inside the cloud modal buttons.
		save: 'Save',
		cancel: 'Cancel'
	},
	zh_CN: {
		cloud: '云存储',
		cloudSettings: '云存储设置',
		cloudActiveTarget: '当前云存储目标',
		cloudActiveTargetDescription: '选择用于保存笔记的云存储目标。',
		cloudAddTarget: '+ 添加云存储目标',
		cloudEditorTitle: '云存储目标编辑器',
		cloudType: '类型',
		cloudTypeDescription: '选择云存储类型。',
		cloudTargets: '云存储目标',
		saveToCloud: '保存到云',
		cloudSaveSuccess: '已保存到云',
		cloudSaveFailed: '保存到云失败',
		cloudTest: '测试连接',
		cloudTestSuccess: '连接成功',
		cloudTestFailed: '连接失败',
		cloudDeleteConfirm: '确定要删除此云存储目标吗？',
		cloudTesting: '测试中...',
		cloudTokenRequired: '测试连接需要令牌/密码',
		cloudNoActiveTarget: '未配置活跃的云存储目标',
		cloudLabelName: '名称',
		cloudNameDescription: '此云存储目标的显示名称。',
		cloudLabelToken: '令牌 / 密码',
		cloudLabelUrl: 'URL',
		cloudLabelUsername: '用户名',
		cloudLabelEndpoint: '端点',
		cloudLabelBucket: '存储桶',
		cloudLabelRegion: '区域',
		cloudLabelPathStyle: '路径样式 URL',
		cloudLabelProvider: '提供商',
		cloudLabelOwner: '所有者',
		cloudLabelRepo: '仓库',
		cloudLabelBranch: '分支',
		cloudLabelNoteId: '笔记 ID',
		cloudLabelPath: '默认路径',
		cloudLabelAccessKey: '访问密钥',
		cloudLabelSecretKey: '秘密密钥',
		cloudLabelNotebook: '笔记本',
		cloudProviderDescription: 'Git 托管提供商。',
		cloudOwnerDescription: '用户名或组织名称。',
		cloudRepoDescription: '仓库名称。',
		cloudBranchDescription: '保存笔记的分支。',
		cloudPathDescription: '保存笔记的默认目录。',
		cloudTokenDescription: '具有仓库访问权限的个人访问令牌。',
		cloudUrlDescription: 'WebDAV 服务器 URL。',
		cloudUsernameDescription: 'WebDAV 用户名。',
		cloudPasswordDescription: 'WebDAV 密码。',
		cloudEndpointDescription: 'S3 兼容端点 URL。',
		cloudBucketDescription: 'S3 存储桶名称。',
		cloudRegionDescription: 'S3 区域。',
		cloudPathStyleDescription: '使用路径样式 URL 而不是虚拟主机样式。',
		cloudAccessKeyDescription: 'S3 访问密钥 ID。',
		cloudSecretKeyDescription: 'S3 秘密访问密钥。',
		cloudNoteIdDescription: '目标笔记 ID（可选）。',
		cloudNotebookDescription: '思源笔记本名称或 ID。',
		cloudSiyuanEndpointDescription: '思源 API 端点，例如 http://127.0.0.1:6806',
		cloudSiyuanTokenDescription: '思源 API 令牌，在「设置 → 关于」中查看。',
		cloudEditTarget: '编辑云存储目标',
		cloudNameRequired: '名称是必需的',
		cloudOwnerRepoRequired: '所有者和仓库是必需的',
		cloudUrlRequired: 'URL 是必需的',
		cloudEndpointBucketRequired: '端点和存储桶是必需的',
		cloudEndpointRequired: '端点是必需的',
		cloudNotebookRequired: '笔记本是必需的',
		cloudGitRepoErrorProvider: '提供商是必需的',
		cloudGitRepoErrorOwner: '所有者是必需的',
		cloudGitRepoErrorRepo: '仓库是必需的',
		cloudGitRepoErrorBranch: '分支是必需的',
		cloudWebdavErrorUrl: 'URL 是必需的',
		cloudWebdavErrorUsername: '用户名是必需的',
		cloudS3ErrorEndpoint: '端点是必需的',
		cloudS3ErrorBucket: '存储桶是必需的',
		cloudS3ErrorRegion: '区域是必需的',
		cloudFastNoteErrorEndpoint: '端点是必需的',
		cloudFastNoteErrorUsername: '用户名是必需的',
		cloudSiyuanErrorEndpoint: '端点是必需的',
		cloudSiyuanErrorToken: '令牌是必需的',
		cloudSiyuanErrorNotebook: '笔记本是必需的',
		// Shared keys used inside the cloud modal buttons.
		save: '保存',
		cancel: '取消'
	}
};

function resolveLocale(): string {
	try {
		const raw = (typeof document !== 'undefined' && document.documentElement.lang) || 'en';
		const normalized = raw.replace('-', '_');
		if (translations[normalized]) return normalized;
		const base = normalized.split('_')[0];
		if (translations[base]) return base;
	} catch {
		// ignore – fall through to default
	}
	return 'en';
}

export function t(key: string): string {
	const locale = resolveLocale();
	const localeMap = translations[locale] || translations.en;
	return localeMap[key] || translations.en[key] || key;
}

/** Apply data-i18n / data-i18n-title attributes within a subtree. */
export function applyCloudTranslations(root: HTMLElement | Document = document): void {
	root.querySelectorAll('[data-i18n]').forEach(element => {
		const key = element.getAttribute('data-i18n');
		if (!key) return;
		// Only translate keys this module owns. Shared keys (save/cancel) are
		// also translated so the cloud modal renders correctly without the
		// global locale files being modified.
		const translation = t(key);
		if (translation === key) return;
		if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
			element.placeholder = translation;
		} else {
			element.textContent = translation;
		}
	});

	root.querySelectorAll('[data-i18n-title]').forEach(element => {
		const key = element.getAttribute('data-i18n-title');
		if (!key) return;
		const translation = t(key);
		if (translation === key) return;
		element.setAttribute('title', translation);
	});
}
