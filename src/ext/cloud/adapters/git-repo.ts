/**
 * Git Repository Adapter
 */

import { makeRemoteTarget } from './base';
import { GitRepoConfig } from '../types';
import { GitRepoClient } from '../clients/git-repo-client';

export const gitRepoTarget = makeRemoteTarget<GitRepoConfig>({
	type: 'gitRepo',
	storageKey: 'git_repos',
	activeIdKey: 'active_git_repo_id',
	secretPrefix: 'git_repo',
	typeLabel: 'Git Repository',
	i18nPrefix: 'cloudGitRepo',

	validate(config) {
		if (!config.provider) return 'cloudGitRepoErrorProvider';
		if (!config.owner) return 'cloudGitRepoErrorOwner';
		if (!config.repo) return 'cloudGitRepoErrorRepo';
		if (!config.branch) return 'cloudGitRepoErrorBranch';
		return null;
	},

	createClient(config, token) {
		return new GitRepoClient({
			provider: config.provider,
			token,
			owner: config.owner,
			repo: config.repo,
			branch: config.branch
		});
	}
});