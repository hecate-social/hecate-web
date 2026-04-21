// Briefcase store — unified presence/privacy model.
//
// Backed by hecate-daemon:
//   - guide_briefcase_lifecycle  (CMD: upload / share / unshare / …)
//   - project_briefcase_files    (PRJ: files ETS read model)
//   - query_briefcase_files      (QRY: /api/briefcase/files endpoints)
//
// See hecate-daemon/plans/PLAN_BRIEFCASE_PRESENCE_PRIVACY.md for the
// target state model. Phase A handles local+private and local+shared;
// remote+placeholder and remote+cached arrive in Phase B and Phase E.

import { writable } from 'svelte/store';
import { get as apiGet, post, postFormData, contentUrl, ApiError } from '$lib/api';

// --- Types ---

export type Privacy = 'private' | 'shared';
export type Presence = 'local' | 'remote';

export interface RealmFile {
	file_id: string;
	realm: string;
	path: string;
	mime_type: string;
	size: number;
	content_hash: string;
	author_did: string;
	uploaded_at: number;
	privacy: Privacy;
	presence: Presence;
	status: number;
	status_label: string;
}

export interface UploadResponse {
	ok: boolean;
	file_id: string;
	path: string;
	size: number;
}

// --- Stores ---

export const realmFiles = writable<RealmFile[]>([]);
export const realmLoading = writable<boolean>(false);
export const realmError = writable<string | null>(null);

// --- Operations ---

export async function loadRealmFiles(): Promise<void> {
	realmLoading.set(true);
	realmError.set(null);
	try {
		const resp = await apiGet<{ items: RealmFile[] }>('/api/briefcase/files');
		realmFiles.set(resp.items || []);
	} catch (e) {
		const msg = e instanceof ApiError ? e.message : String(e);
		realmError.set(msg);
	} finally {
		realmLoading.set(false);
	}
}

/**
 * Upload a file.
 *
 * Optimistic UI: we prepend a placeholder row to `realmFiles` using the
 * upload response fields (file_id, path, size) + local assumptions
 * (privacy=private, presence=local, uploaded_at=now). The subsequent
 * loadRealmFiles() call reconciles against the authoritative read model.
 *
 * This is the fix for the "file never rendered" class of issues —
 * users see their file immediately, regardless of projection lag.
 */
export async function uploadRealmFile(
	file: File,
	logicalPath?: string
): Promise<UploadResponse> {
	const form = new FormData();
	form.append('file', file, file.name);
	if (logicalPath) form.append('path', logicalPath);
	if (file.type) form.append('mime_type', file.type);
	const resp = await postFormData<UploadResponse>(
		'/api/briefcase/files/upload',
		form
	);

	// Optimistic prepend.
	const optimistic: RealmFile = {
		file_id: resp.file_id,
		realm: '',
		path: resp.path,
		mime_type: file.type || 'application/octet-stream',
		size: resp.size,
		content_hash: resp.file_id,
		author_did: '',
		uploaded_at: Date.now(),
		privacy: 'private',
		presence: 'local',
		status: 1,
		status_label: 'Uploaded'
	};
	realmFiles.update((files) => {
		const existing = files.find((f) => f.file_id === optimistic.file_id);
		if (existing) return files;
		return [optimistic, ...files];
	});

	// Reconcile with authoritative state (fills in realm / author_did /
	// content_hash; replaces the optimistic row if the projection has
	// already written it).
	loadRealmFiles().catch(() => {});

	return resp;
}

export async function shareRealmFile(fileId: string): Promise<void> {
	await post(`/api/briefcase/files/${fileId}/share`, {});
	realmFiles.update((files) =>
		files.map((f) => (f.file_id === fileId ? { ...f, privacy: 'shared' } : f))
	);
}

export async function unshareRealmFile(fileId: string): Promise<void> {
	await post(`/api/briefcase/files/${fileId}/unshare`, {});
	realmFiles.update((files) =>
		files.map((f) => (f.file_id === fileId ? { ...f, privacy: 'private' } : f))
	);
}

export function fileContentUrl(fileId: string): string {
	return contentUrl(`/api/briefcase/files/${fileId}/content`);
}

export function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
