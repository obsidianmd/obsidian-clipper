/**
 * SiYuan Note Client
 * Saves notes to SiYuan via its HTTP API
 */

import { RemoteClient, UploadMode, SiyuanConfig } from '../types';

interface SiyuanClientOptions {
	endpoint: string;
	token: string;
	notebook: string;
}

interface SiyuanApiResponse<T = any> {
	code: number;
	msg: string;
	data: T;
}

interface SiyuanNotebook {
	id: string;
	name: string;
	icon: string;
	sort: number;
	closed: boolean;
}

export class SiyuanClient implements RemoteClient {
	private endpoint: string;
	private token: string;
	private notebook: string;

	constructor(options: SiyuanClientOptions) {
		this.endpoint = options.endpoint.replace(/\/$/, '');
		this.token = options.token;
		this.notebook = options.notebook;
	}

	private async request<T = any>(path: string, body: any): Promise<SiyuanApiResponse<T>> {
		const url = `${this.endpoint}${path}`;
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Authorization': `Token ${this.token}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(body)
		});

		const data = await response.json().catch(() => ({})) as SiyuanApiResponse<T>;

		if (!response.ok || data.code !== 0) {
			throw new Error(`SiYuan API error: ${response.status} ${response.statusText}${data.msg ? ' - ' + data.msg : ''}`);
		}

		return data;
	}

	private async resolveNotebookId(): Promise<string> {
		const response = await this.request<{ notebooks: SiyuanNotebook[] }>('/api/notebook/lsNotebooks', {});
		const notebooks = response.data?.notebooks || [];

		// Try matching by name first, then by ID
		const match = notebooks.find(n => n.name === this.notebook || n.id === this.notebook);
		if (!match) {
			throw new Error(`SiYuan notebook not found: ${this.notebook}`);
		}

		if (match.closed) {
			throw new Error(`SiYuan notebook is closed: ${match.name}`);
		}

		return match.id;
	}

	private buildDocPath(path: string): string {
		// SiYuan paths are human-readable paths like /folder/document
		// Strip .md suffix if present
		let docPath = path.replace(/\.md$/i, '');
		if (!docPath.startsWith('/')) {
			docPath = '/' + docPath;
		}
		return docPath;
	}

	async upload(path: string, content: string, mode: UploadMode): Promise<void> {
		const notebookId = await this.resolveNotebookId();
		const docPath = this.buildDocPath(path);

		if (mode === 'create') {
			await this.request<string>('/api/filetree/createDocWithMd', {
				notebook: notebookId,
				path: docPath,
				markdown: content
			});
			return;
		}

		// For overwrite, try to remove existing document first
		if (mode === 'overwrite') {
			try {
				// We need the document ID to remove it. Use SQL to find it.
				const docId = await this.findDocId(notebookId, docPath);
				if (docId) {
					await this.request('/api/filetree/removeDocByID', { id: docId });
				}
			} catch (error) {
				// Document may not exist, continue to create
				console.log('SiYuan overwrite: could not remove existing doc:', error);
			}

			await this.request<string>('/api/filetree/createDocWithMd', {
				notebook: notebookId,
				path: docPath,
				markdown: content
			});
			return;
		}

		// For append/prepend, ensure the document exists then add blocks
		let docId: string | null = null;
		try {
			const createResponse = await this.request<string>('/api/filetree/createDocWithMd', {
				notebook: notebookId,
				path: docPath,
				markdown: ''
			});
			docId = createResponse.data;
		} catch (error) {
			// Document may already exist, find its ID
			docId = await this.findDocId(notebookId, docPath);
		}

		if (!docId) {
			throw new Error('SiYuan: could not find or create document for append/prepend');
		}

		const blockPath = mode === 'append' ? '/api/block/appendBlock' : '/api/block/prependBlock';
		await this.request(blockPath, {
			parentID: docId,
			dataType: 'markdown',
			data: content
		});
	}

	private escapeSql(value: string): string {
		return value.replace(/'/g, "''");
	}

	private async findDocId(notebookId: string, docPath: string): Promise<string | null> {
		try {
			const response = await this.request<{ id: string }[]>('/api/query/sql', {
				stmt: `SELECT id FROM blocks WHERE box = '${this.escapeSql(notebookId)}' AND hpath = '${this.escapeSql(docPath)}' AND type = 'd'`
			});
			const blocks = response.data || [];
			return blocks.length > 0 ? blocks[0].id : null;
		} catch (error) {
			console.error('SiYuan: failed to find doc ID:', error);
			return null;
		}
	}

	async ping(): Promise<void> {
		// Test by listing notebooks and resolving the configured notebook
		await this.resolveNotebookId();
	}
}
