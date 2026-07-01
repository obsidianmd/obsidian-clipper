/**
 * Fast Note Adapter
 */

import { makeRemoteTarget } from './base';
import { FastNoteConfig } from '../types';
import { FastNoteClient } from '../clients/fast-note-client';

export const fastNoteTarget = makeRemoteTarget<FastNoteConfig>({
	type: 'fastNote',
	storageKey: 'fast_note_targets',
	activeIdKey: 'active_fast_note_id',
	secretPrefix: 'fast_note',
	typeLabel: 'Fast Note Sync',
	i18nPrefix: 'cloudFastNote',

	validate(config) {
		if (!config.endpoint) return 'cloudFastNoteErrorEndpoint';
		if (!config.username) return 'cloudFastNoteErrorUsername';
		return null;
	},

	createClient(config, password) {
		return new FastNoteClient({
			endpoint: config.endpoint,
			username: config.username,
			password,
			noteId: config.noteId
		});
	}
});