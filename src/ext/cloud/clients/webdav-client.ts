/**
 * WebDAV Client
 * Basic WebDAV operations using PROPFIND and PUT
 */

import { RemoteClient, UploadMode, WebdavConfig } from '../types';

interface WebdavClientOptions {
	url: string;
	username: string;
	password: string;
}

export class WebdavClient implements RemoteClient {
	private baseUrl: string;
	private username: string;
	private password: string;

	constructor(options: WebdavClientOptions) {
		this.baseUrl = options.url.replace(/\/$/, '');
		this.username = options.username;
		this.password = options.password;
	}

	private getAuthHeader(): string {
		const credentials = btoa(`${this.username}:${this.password}`);
		return `Basic ${credentials}`;
	}

	private async request(method: string, path: string, body?: string, headers?: Record<string, string>): Promise<void> {
		const url = `${this.baseUrl}/${path.replace(/^\//, '')}`;
		const allHeaders = {
			'Authorization': this.getAuthHeader(),
			...headers
		};

		const response = await fetch(url, {
			method,
			headers: allHeaders,
			body
		});

		if (!response.ok) {
			throw new Error(`WebDAV error: ${response.status} ${response.statusText}`);
		}
	}

	async upload(path: string, content: string, mode: UploadMode): Promise<void> {
		const fullPath = path.replace(/^\//, '');

		if (mode === 'create') {
			await this.request('PUT', fullPath, content, { 'Content-Type': 'text/markdown' });
			return;
		}

		// For append/prepend/overwrite, we need to get existing content
		try {
			const existingUrl = `${this.baseUrl}/${fullPath}`;
			const response = await fetch(existingUrl, {
				method: 'GET',
				headers: { 'Authorization': this.getAuthHeader() }
			});

			if (response.ok) {
				const existingContent = await response.text();

				let finalContent = content;
				if (mode === 'append') {
					finalContent = existingContent + '\n' + content;
				} else if (mode === 'prepend') {
					finalContent = content + '\n' + existingContent;
				}

				await this.request('PUT', fullPath, finalContent, { 'Content-Type': 'text/markdown' });
			} else if (response.status === 404) {
				// File doesn't exist, create new
				await this.request('PUT', fullPath, content, { 'Content-Type': 'text/markdown' });
			} else {
				throw new Error(`WebDAV GET error: ${response.status}`);
			}
		} catch (error) {
			// If we can't get existing content, just create new file
			await this.request('PUT', fullPath, content, { 'Content-Type': 'text/markdown' });
		}
	}

	async ping(): Promise<void> {
		// Test by doing PROPFIND on root
		const response = await fetch(this.baseUrl, {
			method: 'PROPFIND',
			headers: {
				'Authorization': this.getAuthHeader(),
				'Content-Type': 'application/xml',
				'Depth': '0'
			},
			body: '<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><prop></prop></propfind>'
		});

		if (!response.ok && response.status !== 207) {
			throw new Error(`WebDAV connection error: ${response.status}`);
		}
	}
}