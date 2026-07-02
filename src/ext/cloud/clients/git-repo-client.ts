/**
 * Git Repository Client (GitHub/Gitee)
 * Uses REST API to upload files to repository
 */

import { RemoteClient, UploadMode, GitRepoConfig } from '../types';

interface GitRepoClientOptions {
	provider: 'github' | 'gitee';
	token: string;
	owner: string;
	repo: string;
	branch: string;
}

export class GitRepoClient implements RemoteClient {
	private provider: 'github' | 'gitee';
	private token: string;
	private owner: string;
	private repo: string;
	private branch: string;

	constructor(options: GitRepoClientOptions) {
		this.provider = options.provider;
		this.token = options.token;
		this.owner = options.owner;
		this.repo = options.repo;
		this.branch = options.branch;
	}

	private getBaseUrl(): string {
		if (this.provider === 'github') {
			return 'https://api.github.com';
		} else {
			return 'https://gitee.com/api/v5';
		}
	}

	private async request(method: string, path: string, body?: any): Promise<any> {
		const url = `${this.getBaseUrl()}${path}`;
		const headers: Record<string, string> = {
			'Accept': this.provider === 'gitee' ? 'application/json' : 'application/vnd.github.v3+json',
			'Content-Type': 'application/json'
		};

		if (this.provider === 'github') {
			headers['Authorization'] = `token ${this.token}`;
		} else {
			// Gitee uses query param for token
			const tokenParam = `access_token=${encodeURIComponent(this.token)}`;
			const urlWithToken = url.includes('?') ? `${url}&${tokenParam}` : `${url}?${tokenParam}`;
			const response = await fetch(urlWithToken, {
				method,
				headers,
				body: body ? JSON.stringify(body) : undefined
			});
			if (!response.ok) {
				const errorBody = await response.text();
				throw new Error(`Git API error: ${response.status} ${response.statusText}${errorBody ? ' - ' + errorBody : ''}`);
			}
			return response.json();
		}

		const response = await fetch(url, {
			method,
			headers,
			body: body ? JSON.stringify(body) : undefined
		});

		if (!response.ok) {
			const errorBody = await response.text();
			throw new Error(`Git API error: ${response.status} ${response.statusText}${errorBody ? ' - ' + errorBody : ''}`);
		}

		if (method === 'PUT' || method === 'POST') {
			return response.json();
		}
		return response.status === 204 ? null : response.json();
	}

	private async getExistingFile(path: string): Promise<{ sha: string; content: string } | null> {
		try {
			const result = await this.request('GET', `/repos/${this.owner}/${this.repo}/contents/${path}?ref=${this.branch}`);
			if (result && result.sha && result.content) {
				return { sha: result.sha, content: result.content };
			}
			return null;
		} catch (error) {
			return null;
		}
	}

	async upload(path: string, content: string, mode: UploadMode): Promise<void> {
		const fullPath = path.startsWith('/') ? path.slice(1) : path;
		const encodedPath = encodeURIComponent(fullPath).replace(/%2F/g, '/');

		const encodedContent = btoa(unescape(encodeURIComponent(content)));

		const existing = await this.getExistingFile(encodedPath);

		let finalContent = encodedContent;

		if (existing && mode !== 'create') {
			if (mode === 'overwrite') {
			} else if (mode === 'append' || mode === 'prepend') {
				const existingContent = decodeURIComponent(escape(atob(existing.content)));
				if (mode === 'append') {
					finalContent = btoa(unescape(encodeURIComponent(existingContent + '\n' + content)));
				} else {
					finalContent = btoa(unescape(encodeURIComponent(content + '\n' + existingContent)));
				}
			}
		}

		const body = {
			message: `Update ${fullPath} via Obsidian Clipper`,
			content: finalContent,
			branch: this.branch,
			...(existing ? { sha: existing.sha } : {})
		};

		// Gitee uses POST to create/update file contents, GitHub uses PUT
		const method = this.provider === 'gitee' ? 'POST' : 'PUT';
		await this.request(method, `/repos/${this.owner}/${this.repo}/contents/${encodedPath}`, body);
	}

	async ping(): Promise<void> {
		// Test by getting repository info
		await this.request('GET', `/repos/${this.owner}/${this.repo}`);
	}
}