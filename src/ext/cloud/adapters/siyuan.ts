/**
 * SiYuan Note Adapter
 */

import { makeRemoteTarget } from './base';
import { SiyuanConfig } from '../types';
import { SiyuanClient } from '../clients/siyuan-client';

export const siyuanTarget = makeRemoteTarget<SiyuanConfig>({
	type: 'siyuan',
	storageKey: 'siyuans',
	activeIdKey: 'active_siyuan_id',
	secretPrefix: 'siyuan',
	typeLabel: 'SiYuan',
	i18nPrefix: 'cloudSiyuan',

	validate(config) {
		if (!config.endpoint) return 'cloudSiyuanErrorEndpoint';
		if (!config.notebook) return 'cloudSiyuanErrorNotebook';
		return null;
	},

	createClient(config, token) {
		return new SiyuanClient({
			endpoint: config.endpoint,
			token: token,
			notebook: config.notebook
		});
	}
});
