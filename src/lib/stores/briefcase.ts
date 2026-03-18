// Briefcase store — folders, files, file type registry, and state management
import { writable, derived } from 'svelte/store';
import { get as apiGet, post, put, del } from '$lib/api';
import { apps, type PluginFileType } from '$lib/stores/apps';

// --- Types ---

export interface Folder {
	folder_id: string;
	name: string;
	parent_id: string | null;
	icon: string;
	status: number;
	created_at: number;
	updated_at: number;
}

export interface FileMeta {
	file_id: string;
	name: string;
	folder_id: string | null;
	file_type: string;
	plugin: string | null;
	icon: string;
	blob_id: string | null;
	size: number;
	mime_type: string | null;
	starred: boolean;
	status: number;
	created_at: number;
	updated_at: number;
}

export interface FolderNode extends Folder {
	children: FolderNode[];
}

// --- Stores ---

export const folders = writable<Folder[]>([]);
export const files = writable<FileMeta[]>([]);
export const briefcaseLoading = writable(false);
export const briefcaseError = writable<string | null>(null);
export const selectedFolderId = writable<string | 'all' | 'starred'>('all');

// --- Derived ---

export const folderTree = derived(folders, ($folders) => buildTree($folders));

export const folderMap = derived(folders, ($folders) => {
	const map = new Map<string, Folder>();
	for (const f of $folders) map.set(f.folder_id, f);
	return map;
});

// --- File Type Registry (derived from installed plugins) ---

export interface RegisteredFileType extends PluginFileType {
	plugin: string;
	pluginDisplayName: string;
}

export const fileTypeRegistry = derived(apps, ($apps) => {
	const types: RegisteredFileType[] = [];
	for (const app of $apps.values()) {
		const fileTypes = app.manifest?.file_types;
		if (!fileTypes || !Array.isArray(fileTypes)) continue;
		for (const ft of fileTypes) {
			types.push({
				...ft,
				plugin: app.info.name,
				pluginDisplayName: app.manifest?.display_name || app.info.display_name || app.info.name,
			});
		}
	}
	return types;
});

export const creatableFileTypes = derived(fileTypeRegistry, ($types) =>
	$types.filter((t) => t.can_create)
);

// --- API ---

export async function fetchFolders(): Promise<void> {
	try {
		const res = await apiGet<{ ok: boolean; folders: Folder[] }>('/api/briefcase/folders');
		folders.set(res.folders ?? []);
	} catch {
		// daemon may not have briefcase yet
		folders.set([]);
	}
}

export async function fetchFiles(params?: {
	folder_id?: string;
	starred?: boolean;
	search?: string;
	file_type?: string;
}): Promise<void> {
	briefcaseLoading.set(true);
	briefcaseError.set(null);
	try {
		const query = new URLSearchParams();
		if (params?.folder_id) query.set('folder_id', params.folder_id);
		if (params?.starred) query.set('starred', 'true');
		if (params?.search) query.set('search', params.search);
		if (params?.file_type) query.set('file_type', params.file_type);
		const qs = query.toString();
		const path = qs ? `/api/briefcase/files?${qs}` : '/api/briefcase/files';
		const res = await apiGet<{ ok: boolean; files: FileMeta[]; total: number }>(path);
		files.set(res.files ?? []);
	} catch (e) {
		briefcaseError.set(e instanceof Error ? e.message : 'Failed to load files');
		files.set([]);
	} finally {
		briefcaseLoading.set(false);
	}
}

export async function createFolder(name: string, parentId?: string, icon?: string): Promise<string | null> {
	try {
		const body: Record<string, unknown> = { name };
		if (parentId) body.parent_id = parentId;
		if (icon) body.icon = icon;
		const res = await post<{ ok: boolean; folder_id: string }>('/api/briefcase/folders', body);
		await fetchFolders();
		return res.folder_id;
	} catch (e) {
		briefcaseError.set(e instanceof Error ? e.message : 'Failed to create folder');
		return null;
	}
}

export async function renameFolder(folderId: string, name: string): Promise<void> {
	await put(`/api/briefcase/folders/${encodeURIComponent(folderId)}`, { name });
	await fetchFolders();
}

export async function moveFolder(folderId: string, parentId: string | null): Promise<void> {
	await put(`/api/briefcase/folders/${encodeURIComponent(folderId)}`, { parent_id: parentId });
	await fetchFolders();
}

export async function archiveFolder(folderId: string): Promise<void> {
	await del(`/api/briefcase/folders/${encodeURIComponent(folderId)}`);
	await fetchFolders();
}

export async function registerFile(params: {
	name: string;
	file_type: string;
	plugin?: string;
	folder_id?: string;
	icon?: string;
}): Promise<string | null> {
	try {
		const res = await post<{ ok: boolean; file_id: string }>('/api/briefcase/files', params);
		return res.file_id;
	} catch (e) {
		briefcaseError.set(e instanceof Error ? e.message : 'Failed to register file');
		return null;
	}
}

export async function importFile(name: string, folderId: string | null, bytes: string): Promise<string | null> {
	try {
		const body: Record<string, unknown> = { name, bytes };
		if (folderId) body.folder_id = folderId;
		const res = await post<{ ok: boolean; file_id: string }>('/api/briefcase/files/import', body);
		return res.file_id;
	} catch (e) {
		briefcaseError.set(e instanceof Error ? e.message : 'Failed to import file');
		return null;
	}
}

export async function renameFile(fileId: string, name: string): Promise<void> {
	await put(`/api/briefcase/files/${encodeURIComponent(fileId)}`, { name });
}

export async function moveFile(fileId: string, folderId: string | null): Promise<void> {
	await put(`/api/briefcase/files/${encodeURIComponent(fileId)}`, { folder_id: folderId });
}

export async function starFile(fileId: string): Promise<void> {
	await put(`/api/briefcase/files/${encodeURIComponent(fileId)}`, { starred: true });
}

export async function unstarFile(fileId: string): Promise<void> {
	await put(`/api/briefcase/files/${encodeURIComponent(fileId)}`, { starred: false });
}

export async function archiveFile(fileId: string): Promise<void> {
	await del(`/api/briefcase/files/${encodeURIComponent(fileId)}`);
}

// --- Tree builder ---

function buildTree(flat: Folder[]): FolderNode[] {
	const map = new Map<string, FolderNode>();
	const roots: FolderNode[] = [];

	for (const f of flat) {
		map.set(f.folder_id, { ...f, children: [] });
	}

	for (const node of map.values()) {
		if (node.parent_id && map.has(node.parent_id)) {
			map.get(node.parent_id)!.children.push(node);
		} else {
			roots.push(node);
		}
	}

	// Sort children alphabetically
	const sortChildren = (nodes: FolderNode[]) => {
		nodes.sort((a, b) => a.name.localeCompare(b.name));
		for (const n of nodes) sortChildren(n.children);
	};
	sortChildren(roots);

	return roots;
}

// --- File type icons ---

const FILE_ICONS: Record<string, string> = {
	scribe: '\uD83D\uDCDD',
	stage: '\uD83C\uDFAC',
	ledger: '\uD83D\uDCCA',
	pdf: '\uD83D\uDCC4',
	image: '\uD83D\uDDBC\uFE0F',
	markdown: '\uD83D\uDCCB',
	text: '\uD83D\uDCC4',
	csv: '\uD83D\uDCC8',
	json: '\uD83D\uDCC4',
	archive: '\uD83D\uDCE6',
	audio: '\uD83C\uDFB5',
	video: '\uD83C\uDFAC',
	html: '\uD83C\uDF10',
	file: '\uD83D\uDCCE',
};

export function fileIcon(fileType: string): string {
	return FILE_ICONS[fileType] ?? FILE_ICONS.file;
}

export function formatFileSize(bytes: number): string {
	if (bytes === 0) return '';
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
