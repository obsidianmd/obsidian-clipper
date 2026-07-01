/**
 * WebDAV Adapter
 */

import { makeRemoteTarget } from './base';
import { WebdavConfig } from '../types';
import { WebdavClient } from '../clients/webdav-client';

export const webdavTarget = makeRemoteTarget<WebdavConfig>({
	type: 'webdav',
	storageKey: 'webdavs',
	activeIdKey: 'active_webdav_id',
	secretPrefix: 'webdav',
	typeLabel: 'WebDAV',
	i18nPrefix: 'cloudWebdav',

	validate(config) {
		if (!config.url) return 'cloudWebdavErrorUrl';
		if (!config.username) return 'cloudWebdavErrorUsername';
		return null;
	},

	createClient(config, password) {
		return new WebdavClient({
			url: config.url,
			username: config.username,
			password
		});
	}
});