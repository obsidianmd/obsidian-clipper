/**
 * Cloud storage module entry point
 * Exports main interfaces and functions
 */

export { CloudTarget, GitRepoConfig, WebdavConfig, S3Config, FastNoteConfig, UploadResult, UploadRequest, RemoteTarget, RemoteClient, UploadMode } from './types';

export { executeRemoteUpload, getActiveCloudTarget, testCloudConnection, ALL_TARGETS } from './upload';

export { makeRemoteTarget, getSecret, setSecret, removeSecret, generateId, setActiveTargetId } from './adapters/base';

export { gitRepoTarget } from './adapters/git-repo';
export { webdavTarget } from './adapters/webdav';
export { s3Target } from './adapters/s3';
export { fastNoteTarget } from './adapters/fast-note';

export { GitRepoClient } from './clients/git-repo-client';
export { WebdavClient } from './clients/webdav-client';
export { S3Client } from './clients/s3-client';
export { FastNoteClient } from './clients/fast-note-client';

export { mountCloudSettings, renderCloudTargetList } from './ui/cloud-settings';