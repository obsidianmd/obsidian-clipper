/**
 * Fast Note Client
 * Simple REST API client for Fast Note backend
 */

import { RemoteClient, UploadMode, FastNoteConfig } from '../types';

interface FastNoteClientOptions {
	endpoint: string;
	username: string;
	password: string;
	noteId?: string;
}

interface FastNoteTokenResponse {
	token: string;
	expires?: number;
}

export class FastNoteClient implements RemoteClient {
	private endpoint: string;
	private username: string;
	private password: string;
	private noteId: string | undefined;
	private token: string | null = null;
	private tokenExpires: number | null = null;

	constructor(options: FastNoteClientOptions) {
		this.endpoint = options.endpoint.replace(/\/$/, '');
		this.username = options.username;
		this.password = options.password;
		this.noteId = options.noteId;
	}

	private async login(): Promise<void> {
		const response = await fetch(`${this.endpoint}/auth/login`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				username: this.username,
				password: this.password
			})
		});

		if (!response.ok) {
			throw new Error(`Fast Note login error: ${response.status}`);
		}

		const data: FastNoteTokenResponse = await response.json();
		this.token = data.token;
		this.tokenExpires = data.expires ? Date.now() + data.expires : null;
	}

	private async ensureToken(): Promise<void> {
		if (!this.token || (this.tokenExpires && Date.now() >= this.tokenExpires)) {
			await this.login();
		}
	}

	private async request(method: string, path: string, body?: any): Promise<any> {
		await this.ensureToken();

		const url = `${this.endpoint}${path}`;
		const headers: Record<string, string> = {
			'Authorization': `Bearer ${this.token}`,
			'Content-Type': 'application/json'
		};

		const response = await fetch(url, {
			method,
			headers,
			body: body ? JSON.stringify(body) : undefined
		});

		if (response.status === 401) {
			// Token expired, re-login and retry
			this.token = null;
			await this.ensureToken();
			headers.Authorization = `Bearer ${this.token}`;
			const retryResponse = await fetch(url, {
				method,
				headers,
				body: body ? JSON.stringify(body) : undefined
			});
			if (!retryResponse.ok) {
				throw new Error(`Fast Note API error: ${retryResponse.status}`);
			}
			return retryResponse.json();
		}

		if (!response.ok) {
			throw new Error(`Fast Note API error: ${response.status}`);
		}

		if (response.status === 204) {
			return null;
		}

		return response.json();
	}

	async upload(path: string, content: string, mode: UploadMode): Promise<void> {
		const noteId = this.noteId || 'default';

		await this.request('PUT', `/notes/${noteId}/content`, {
			path,
			content,
			mode
		});
	}

	async ping(): Promise<void> {
		await this.request('GET', '/notes');
	}
}