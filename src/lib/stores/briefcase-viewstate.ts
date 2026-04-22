// Viewstate-driven briefcase store.
//
// Hits GET /api/viewstate/briefcase/files which returns rows with
// daemon-computed `available_actions` + `guard` fields. The frontend
// consumes the action descriptors directly — no business logic about
// "when to show download vs evict vs cancel" lives on this side.
//
// Replaces the action logic that used to live in
// briefcase-realm.ts + +page.svelte. The realm store is still useful
// for upload (which is a fire-once command, not a viewstate concern).

import { writable } from 'svelte/store';
import { get as apiGet, post, del, contentUrl, ApiError } from '$lib/api';

// --- Types ---

export type Presence = 'local' | 'remote' | 'downloading' | 'cached';
export type Privacy = 'private' | 'shared';

export type GuardState = 'ok' | 'refused' | 'not_applicable';

export interface GuardView {
	state: GuardState;
	reason: string | null;
}

export type ActionVariant = 'primary' | 'secondary' | 'danger' | 'info' | 'disabled';

export interface ActionDescriptor {
	id: string;
	label: string;
	method: 'GET' | 'POST' | 'DELETE' | 'PUT';
	url_suffix: string;
	variant: ActionVariant;
	confirm: string | null;
}

export interface FileView {
	file_id: string;
	realm: string;
	path: string;
	mime_type: string;
	size: number;
	content_hash?: string;
	author_did: string;
	uploaded_at: number;
	privacy: Privacy;
	presence: Presence;
	status: number;
	status_label: string;
	cache_size?: number;
	cached_at?: number;
	source_realm?: string;
	download_started_at?: number;
	download_failed_at?: number;
	download_failure_reason?: string;
	guard: GuardView;
	available_actions: ActionDescriptor[];
}

export interface DownloadProgress {
	file_id: string;
	state: 'downloading' | 'completed' | 'failed' | 'cancelled';
	bytes_written: number;
	frames: number;
	total_size: number | null;
	percent: number | null;
	started_at: number | null;
	last_update_at: number | null;
	reason: string | null;
}

// --- Stores ---

export const fileViews = writable<FileView[]>([]);
export const viewLoading = writable<boolean>(false);
export const viewError = writable<string | null>(null);

// --- Operations ---

export async function loadFileViews(): Promise<void> {
	viewLoading.set(true);
	viewError.set(null);
	try {
		const resp = await apiGet<{ files: FileView[] }>(
			'/api/viewstate/briefcase/files'
		);
		fileViews.set(resp.files || []);
	} catch (e) {
		const msg = e instanceof ApiError ? e.message : String(e);
		viewError.set(msg);
	} finally {
		viewLoading.set(false);
	}
}

// Build the URL for a (fileId, action). action.url_suffix may be
// empty (info action → /api/briefcase/files/:id) or a path segment
// (/share, /content, /download, /cache).
export function actionUrl(fileId: string, action: ActionDescriptor): string {
	return `/api/briefcase/files/${fileId}${action.url_suffix}`;
}

// Same URL but resolved through the API client's content path (Tauri
// proxy → Unix socket). Use for `<a href>` open / download links.
export function actionContentUrl(fileId: string, action: ActionDescriptor): string {
	return contentUrl(actionUrl(fileId, action));
}

// Dispatch an action that's a state-changing call (POST/DELETE).
// GET actions (open/info) should be invoked via `actionContentUrl`
// in an <a> tag, not here.
export async function runAction(
	fileId: string,
	action: ActionDescriptor,
	body: unknown = {}
): Promise<unknown> {
	const url = actionUrl(fileId, action);
	switch (action.method) {
		case 'POST':
			return await post(url, body);
		case 'DELETE':
			return await del(url);
		case 'GET':
			return await apiGet(url);
		default:
			throw new Error(`Unsupported action method: ${action.method}`);
	}
}

export async function getDownloadProgress(fileId: string): Promise<DownloadProgress> {
	return await apiGet<DownloadProgress>(
		`/api/briefcase/files/${fileId}/download`
	);
}

// Light-weight polling helper. Calls `onUpdate` until the state is
// no longer 'downloading' or until `signal` aborts. Returns the
// terminal state.
export async function pollDownloadUntilDone(
	fileId: string,
	onUpdate: (p: DownloadProgress) => void,
	intervalMs = 750,
	signal?: AbortSignal
): Promise<DownloadProgress> {
	while (true) {
		if (signal?.aborted) {
			return await getDownloadProgress(fileId);
		}
		const p = await getDownloadProgress(fileId);
		onUpdate(p);
		if (p.state !== 'downloading') return p;
		await new Promise((r) => setTimeout(r, intervalMs));
	}
}

export function formatSize(bytes: number | undefined | null): string {
	if (bytes == null) return '—';
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function variantClass(variant: ActionVariant): string {
	switch (variant) {
		case 'primary':   return 'btn btn-xs btn-primary';
		case 'danger':    return 'btn btn-xs btn-error';
		case 'info':      return 'btn btn-xs btn-info';
		case 'disabled':  return 'btn btn-xs btn-ghost btn-disabled';
		case 'secondary':
		default:          return 'btn btn-xs btn-ghost';
	}
}

export function presenceLabelClass(presence: Presence): string {
	switch (presence) {
		case 'local':       return 'bg-surface-700/50 text-surface-300 border-surface-600';
		case 'remote':      return 'bg-amber-500/10 text-amber-300 border-amber-600/40';
		case 'downloading': return 'bg-blue-500/15 text-blue-300 border-blue-500/40';
		case 'cached':      return 'bg-macula-600/20 text-macula-300 border-macula-600/40';
		default:            return 'bg-surface-700/50 text-surface-400 border-surface-600';
	}
}
