// Realm-synced Briefcase store.
//
// Backed by hecate-daemon:
//   - guide_briefcase_lifecycle  (CMD: upload/revise/archive/grant/…)
//   - project_briefcase_files    (PRJ: files ETS read model)
//   - query_briefcase_files      (QRY: /api/briefcase/files endpoints)
//
// Unlike `$lib/stores/briefcase.ts` (Tauri-FS, local-only scratch),
// this store publishes events to the realm so files propagate across
// every peer.
//
// See hecate-daemon/plans/PLAN_BRIEFCASE.md for the phased roadmap.

import { writable } from 'svelte/store';
import { get as apiGet, postFormData, contentUrl, ApiError } from '$lib/api';

// --- Types ---

export interface RealmFile {
	file_id: string;
	realm: string;
	path: string;
	mime_type: string;
	size: number;
	content_hash: string;
	author_did: string;
	uploaded_at: number;
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
	await loadRealmFiles();
	return resp;
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
