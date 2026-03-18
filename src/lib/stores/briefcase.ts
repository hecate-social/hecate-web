// Briefcase store — unified item model (folders, blobs, symlinks)
import { writable, derived } from 'svelte/store';
import { get as apiGet, post, put, del } from '$lib/api';
import { apps, type PluginFileType } from '$lib/stores/apps';

// --- Types ---

export type ItemKind = 'folder' | 'blob' | 'symlink';

export interface BriefcaseItem {
	item_id: string;
	name: string;
	kind: ItemKind;
	parent_id: string | null;
	plugin: string | null;
	file_type: string | null;
	icon: string | null;
	path: string | null;
	mime_type: string | null;
	size: number;
	starred: boolean;
	status: number;
	created_at: number;
	updated_at: number;
}

export interface FolderNode extends BriefcaseItem {
	children: FolderNode[];
}

// --- Stores ---

export const items = writable<BriefcaseItem[]>([]);
export const briefcaseLoading = writable(false);
export const briefcaseError = writable<string | null>(null);
export const selectedFolderId = writable<string | 'all' | 'starred'>('all');

// --- Derived ---

export const folderItems = derived(items, ($items) =>
	$items.filter((i) => i.kind === 'folder')
);

export const folderTree = derived(folderItems, ($folders) => buildTree($folders));

export const folderMap = derived(folderItems, ($folders) => {
	const map = new Map<string, BriefcaseItem>();
	for (const f of $folders) map.set(f.item_id, f);
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
		const res = await apiGet<{ ok: boolean; folders: BriefcaseItem[] }>('/api/briefcase/folders');
		const folderList = res.folders ?? [];
		// Merge folders into the items store (replace folder-kind items, keep others)
		items.update(($items) => {
			const nonFolders = $items.filter((i) => i.kind !== 'folder');
			return [...nonFolders, ...folderList];
		});
	} catch {
		// daemon may not have briefcase yet
	}
}

export async function fetchItems(params?: {
	parent_id?: string;
	kind?: ItemKind;
	starred?: boolean;
	search?: string;
	file_type?: string;
}): Promise<void> {
	briefcaseLoading.set(true);
	briefcaseError.set(null);
	try {
		const query = new URLSearchParams();
		if (params?.parent_id) query.set('parent_id', params.parent_id);
		if (params?.kind) query.set('kind', params.kind);
		if (params?.starred) query.set('starred', 'true');
		if (params?.search) query.set('search', params.search);
		if (params?.file_type) query.set('file_type', params.file_type);
		const qs = query.toString();
		const path = qs ? `/api/briefcase/items?${qs}` : '/api/briefcase/items';
		const res = await apiGet<{ ok: boolean; items: BriefcaseItem[]; total: number }>(path);
		items.set(res.items ?? []);
	} catch (e) {
		briefcaseError.set(e instanceof Error ? e.message : 'Failed to load items');
		items.set([]);
	} finally {
		briefcaseLoading.set(false);
	}
}

export async function createItem(params: {
	name: string;
	kind: ItemKind;
	parent_id?: string;
	plugin?: string;
	file_type?: string;
	icon?: string;
	path?: string;
	mime_type?: string;
	size?: number;
}): Promise<string | null> {
	try {
		const res = await post<{ ok: boolean; item_id: string }>('/api/briefcase/items', params);
		return res.item_id;
	} catch (e) {
		briefcaseError.set(e instanceof Error ? e.message : 'Failed to create item');
		return null;
	}
}

export async function createFolder(name: string, parentId?: string, icon?: string): Promise<string | null> {
	const id = await createItem({
		name,
		kind: 'folder',
		parent_id: parentId,
		icon: icon ?? undefined,
	});
	if (id) await fetchFolders();
	return id;
}

export async function renameItem(itemId: string, name: string): Promise<void> {
	await put(`/api/briefcase/items/${encodeURIComponent(itemId)}`, { name });
}

export async function moveItem(itemId: string, parentId: string | null): Promise<void> {
	await put(`/api/briefcase/items/${encodeURIComponent(itemId)}`, { parent_id: parentId });
}

export async function starItem(itemId: string): Promise<void> {
	await put(`/api/briefcase/items/${encodeURIComponent(itemId)}`, { starred: true });
}

export async function unstarItem(itemId: string): Promise<void> {
	await put(`/api/briefcase/items/${encodeURIComponent(itemId)}`, { starred: false });
}

export async function archiveItem(itemId: string): Promise<void> {
	await del(`/api/briefcase/items/${encodeURIComponent(itemId)}`);
}

// --- Tree builder ---

function buildTree(flat: BriefcaseItem[]): FolderNode[] {
	const map = new Map<string, FolderNode>();
	const roots: FolderNode[] = [];

	for (const f of flat) {
		map.set(f.item_id, { ...f, children: [] });
	}

	for (const node of map.values()) {
		if (node.parent_id && map.has(node.parent_id)) {
			map.get(node.parent_id)!.children.push(node);
		} else {
			roots.push(node);
		}
	}

	const sortChildren = (nodes: FolderNode[]) => {
		nodes.sort((a, b) => a.name.localeCompare(b.name));
		for (const n of nodes) sortChildren(n.children);
	};
	sortChildren(roots);

	return roots;
}

// --- Item icons ---

const TYPE_ICONS: Record<string, string> = {
	folder: '\uD83D\uDCC1',
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

export function itemIcon(item: BriefcaseItem): string {
	if (item.kind === 'folder') return TYPE_ICONS.folder;
	return TYPE_ICONS[item.file_type ?? ''] ?? TYPE_ICONS.file;
}

export function formatFileSize(bytes: number): string {
	if (bytes === 0) return '';
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
