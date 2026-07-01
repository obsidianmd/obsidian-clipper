/**
 * S3 Client
 * Simple S3 operations with AWS SigV4 signing using native Web Crypto API
 */

import { RemoteClient, UploadMode, S3Config } from '../types';

interface S3ClientOptions {
	endpoint: string;
	bucket: string;
	region: string;
	accessKey: string;
	secretKey: string;
	pathStyle?: boolean;
}

export class S3Client implements RemoteClient {
	private endpoint: string;
	private bucket: string;
	private region: string;
	private accessKey: string;
	private secretKey: string;
	private pathStyle: boolean;

	constructor(options: S3ClientOptions) {
		this.endpoint = options.endpoint.replace(/\/$/, '');
		this.bucket = options.bucket;
		this.region = options.region;
		this.accessKey = options.accessKey;
		this.secretKey = options.secretKey;
		this.pathStyle = options.pathStyle ?? true;
	}

	private getUrl(key: string): string {
		if (this.pathStyle) {
			return `${this.endpoint}/${this.bucket}/${key}`;
		} else {
			// Virtual-hosted style
			const baseHost = this.endpoint.replace(/^https?:\/\/([^\/]+)/, '$1');
			return `https://${this.bucket}.${baseHost}/${key}`;
		}
	}

	private async hmacSha256(key: Uint8Array, message: string): Promise<Uint8Array> {
		const cryptoKey = await crypto.subtle.importKey(
			'raw',
			key,
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['sign']
		);
		const signature = await crypto.subtle.sign(
			'HMAC',
			cryptoKey,
			new TextEncoder().encode(message)
		);
		return new Uint8Array(signature);
	}

	private async sha256(message: string): Promise<string> {
		const data = new TextEncoder().encode(message);
		const hashBuffer = await crypto.subtle.digest('SHA-256', data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
	}

	private getHost(): string {
		if (this.pathStyle) {
			return this.endpoint.replace(/^https?:\/\/([^\/]+)/, '$1');
		} else {
			return `${this.bucket}.${this.endpoint.replace(/^https?:\/\/([^\/]+)/, '$1')}`;
		}
	}

	private async buildSignature(
		method: string,
		path: string,
		queryString: string,
		amzDate: string,
		dateStamp: string,
		bodyHash: string
	): Promise<{ authorization: string; host: string }> {
		const host = this.getHost();

		const canonicalHeaders = `host:${host}\n`;
		const signedHeaders = 'host';

		const canonicalRequest = [
			method,
			path,
			queryString,
			canonicalHeaders,
			signedHeaders,
			bodyHash
		].join('\n');

		const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;

		const stringToSign = [
			'AWS4-HMAC-SHA256',
			amzDate,
			credentialScope,
			await this.sha256(canonicalRequest)
		].join('\n');

		// Calculate signature
		const kDate = await this.hmacSha256(
			new TextEncoder().encode(`AWS4${this.secretKey}`),
			dateStamp
		);
		const kRegion = await this.hmacSha256(kDate, this.region);
		const kService = await this.hmacSha256(kRegion, 's3');
		const kSigning = await this.hmacSha256(kService, 'aws4_request');
		const signatureArray = await this.hmacSha256(kSigning, stringToSign);
		const signature = Array.from(signatureArray).map(b => b.toString(16).padStart(2, '0')).join('');

		const authorization = `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

		return { authorization, host };
	}

	private async signedRequest(
		method: string,
		key: string,
		body: string,
		contentType?: string
	): Promise<void> {
		const date = new Date();
		const amzDate = date.toISOString().replace(/[:\-]|\.\d{3}/g, '');
		const dateStamp = amzDate.slice(0, 8);

		const path = this.pathStyle ? `/${this.bucket}/${key}` : `/${key}`;
		const url = this.getUrl(key);
		const bodyHash = await this.sha256(body);

		const { authorization, host } = await this.buildSignature(
			method,
			path,
			'',
			amzDate,
			dateStamp,
			bodyHash
		);

		const headers: Record<string, string> = {
			'Host': host,
			'Authorization': authorization,
			'x-amz-date': amzDate,
			'x-amz-content-sha256': bodyHash
		};

		if (contentType) {
			headers['Content-Type'] = contentType;
		}

		const response = await fetch(url, {
			method,
			headers,
			body: body || undefined
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`S3 error: ${response.status} ${errorText}`);
		}
	}

	async upload(path: string, content: string, mode: UploadMode): Promise<void> {
		const key = path.replace(/^\//, '');

		if (mode === 'create') {
			await this.signedRequest('PUT', key, content, 'text/markdown');
			return;
		}

		// For append/prepend/overwrite, get existing content first
		const date = new Date();
		const amzDate = date.toISOString().replace(/[:\-]|\.\d{3}/g, '');
		const dateStamp = amzDate.slice(0, 8);

		const urlPath = this.pathStyle ? `/${this.bucket}/${key}` : `/${key}`;
		const url = this.getUrl(key);
		const bodyHash = await this.sha256('');

		const { authorization, host } = await this.buildSignature(
			'GET',
			urlPath,
			'',
			amzDate,
			dateStamp,
			bodyHash
		);

		try {
			const response = await fetch(url, {
				method: 'GET',
				headers: {
					'Host': host,
					'Authorization': authorization,
					'x-amz-date': amzDate,
					'x-amz-content-sha256': bodyHash
				}
			});

			if (response.ok) {
				const existingContent = await response.text();

				let finalContent = content;
				if (mode === 'append') {
					finalContent = existingContent + '\n' + content;
				} else if (mode === 'prepend') {
					finalContent = content + '\n' + existingContent;
				}

				await this.signedRequest('PUT', key, finalContent, 'text/markdown');
			} else if (response.status === 404 || response.status === 403) {
				await this.signedRequest('PUT', key, content, 'text/markdown');
			} else {
				throw new Error(`S3 GET error: ${response.status}`);
			}
		} catch {
			await this.signedRequest('PUT', key, content, 'text/markdown');
		}
	}

	async ping(): Promise<void> {
		const date = new Date();
		const amzDate = date.toISOString().replace(/[:\-]|\.\d{3}/g, '');
		const dateStamp = amzDate.slice(0, 8);

		const path = this.pathStyle ? `/${this.bucket}` : '/';
		const url = this.pathStyle
			? `${this.endpoint}/${this.bucket}`
			: `https://${this.bucket}.${this.endpoint.replace(/^https?:\/\/([^\/]+)/, '$1')}`;
		const bodyHash = await this.sha256('');

		const { authorization, host } = await this.buildSignature(
			'GET',
			path,
			'max-keys=0',
			amzDate,
			dateStamp,
			bodyHash
		);

		const response = await fetch(`${url}?max-keys=0`, {
			method: 'GET',
			headers: {
				'Host': host,
				'Authorization': authorization,
				'x-amz-date': amzDate,
				'x-amz-content-sha256': bodyHash
			}
		});

		if (!response.ok && response.status !== 403) {
			throw new Error(`S3 connection error: ${response.status}`);
		}
	}
}