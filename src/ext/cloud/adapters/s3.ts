/**
 * S3 Adapter
 */

import { makeRemoteTarget } from './base';
import { S3Config } from '../types';
import { S3Client } from '../clients/s3-client';

export const s3Target = makeRemoteTarget<S3Config>({
	type: 's3',
	storageKey: 's3_targets',
	activeIdKey: 'active_s3_id',
	secretPrefix: 's3',
	typeLabel: 'S3 Storage',
	i18nPrefix: 'cloudS3',

	validate(config) {
		if (!config.endpoint) return 'cloudS3ErrorEndpoint';
		if (!config.bucket) return 'cloudS3ErrorBucket';
		if (!config.region) return 'cloudS3ErrorRegion';
		return null;
	},

	createClient(config, secret) {
		// Parse secret: accessKey:secretKey format
		const [accessKey, secretKey] = secret.split(':');
		return new S3Client({
			endpoint: config.endpoint,
			bucket: config.bucket,
			region: config.region,
			accessKey,
			secretKey,
			pathStyle: config.pathStyle
		});
	}
});