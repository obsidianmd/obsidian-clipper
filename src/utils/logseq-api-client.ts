import { generalSettings } from './storage-utils';

export interface BatchBlock {
	content: string;
	children?: BatchBlock[];
}

export class LogseqAPIClient {
	private get baseUrl(): string {
		return `http://127.0.0.1:${generalSettings.logseqApiPort || 12315}`;
	}

	private get token(): string {
		return generalSettings.logseqApiToken || '';
	}

	async call(method: string, args: any[]): Promise<any> {
		const response = await fetch(`${this.baseUrl}/api`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${this.token}`
			},
			body: JSON.stringify({ method, args })
		});

		if (!response.ok) {
			const text = await response.text().catch(() => response.statusText);
			throw new Error(`LogSeq API error ${response.status}: ${text}`);
		}

		return response.json();
	}

	async isAvailable(): Promise<boolean> {
		try {
			await fetch(`${this.baseUrl}/api`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${this.token}`
				},
				body: JSON.stringify({ method: 'logseq.App.getCurrentGraph', args: [] }),
				signal: AbortSignal.timeout(3000)
			});
			return true;
		} catch {
			return false;
		}
	}

	async getCurrentGraph(): Promise<string | null> {
		try {
			const result = await this.call('logseq.App.getCurrentGraph', []);
			return result?.name || null;
		} catch {
			return null;
		}
	}

	async getPage(name: string): Promise<any> {
		return this.call('logseq.Editor.getPage', [name]);
	}

	async createPage(name: string, properties?: Record<string, string>, options?: { redirect?: boolean }): Promise<any> {
		return this.call('logseq.Editor.createPage', [name, properties || {}, { redirect: false, ...options }]);
	}

	async appendBlockInPage(page: string, content: string): Promise<any> {
		return this.call('logseq.Editor.appendBlockInPage', [page, content]);
	}

	async prependBlockInPage(page: string, content: string): Promise<any> {
		return this.call('logseq.Editor.prependBlockInPage', [page, content]);
	}

	async insertBatchBlock(srcBlock: string, blocks: BatchBlock[], opts?: { sibling?: boolean }): Promise<any> {
		return this.call('logseq.Editor.insertBatchBlock', [srcBlock, blocks, { sibling: false, ...opts }]);
	}

	async getPageBlocksTree(page: string): Promise<any[]> {
		return this.call('logseq.Editor.getPageBlocksTree', [page]);
	}

	async removeBlock(blockUuid: string): Promise<any> {
		return this.call('logseq.Editor.removeBlock', [blockUuid]);
	}
}

export const logseqClient = new LogseqAPIClient();
