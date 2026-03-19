// Briefcase store — filesystem-based, Tauri-native
//
// Briefcase IS a directory on disk: $HECATE_HOME/briefcase/
// Folders = directories. Files = files. No event sourcing.
import { writable, derived } from 'svelte/store';
import { apps, type PluginFileType } from '$lib/stores/apps';

// --- Types ---

export interface BriefcaseEntry {
	name: string;
	path: string;
	isDir: boolean;
	extension: string | null;
	size: number;
	modifiedAt: number | null;
}

export interface BriefcaseMeta {
	starred: string[];
	recent: string[];
}

// --- Stores ---

export const entries = writable<BriefcaseEntry[]>([]);
export const currentPath = writable<string>('');
export const briefcaseRoot = writable<string>('');
export const meta = writable<BriefcaseMeta>({ starred: [], recent: [] });
export const briefcaseLoading = writable(false);

// --- File Type Registry ---

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

// --- Filesystem Operations (Tauri-native) ---

async function fs(): Promise<any> {
	const pkg = '@tauri-apps/plugin-fs';
	return import(/* @vite-ignore */ pkg);
}

async function dialog(): Promise<any> {
	const pkg = '@tauri-apps/plugin-dialog';
	return import(/* @vite-ignore */ pkg);
}

export async function initBriefcase(): Promise<void> {
	const hecateHome = await getHecateHome();
	const root = `${hecateHome}/briefcase`;
	briefcaseRoot.set(root);
	currentPath.set(root);

	// Ensure directory exists
	const fsMod = await fs();
	try { await fsMod.mkdir(root, { recursive: true }); } catch { /* exists */ }

	// Ensure .briefcase metadata dir
	try { await fsMod.mkdir(`${root}/.briefcase`, { recursive: true }); } catch { /* exists */ }

	await loadMeta(root);
	await loadEntries(root);
}

async function getHecateHome(): Promise<string> {
	// Try HECATE_HOME env var first, fall back to ~/.hecate
	try {
		const envMod: any = await import(/* @vite-ignore */ '@tauri-apps/api/core');
		// Tauri doesn't expose env directly — use home dir convention
		const pathMod: any = await import(/* @vite-ignore */ '@tauri-apps/api/path');
		const home = await pathMod.homeDir();
		return `${home}.hecate`;
	} catch {
		return `${await homeDir()}/.hecate`;
	}
}

async function homeDir(): Promise<string> {
	try {
		const pathMod: any = await import(/* @vite-ignore */ '@tauri-apps/api/path');
		return await pathMod.homeDir();
	} catch {
		return '/home/user'; // fallback
	}
}

export async function loadEntries(dirPath: string): Promise<void> {
	briefcaseLoading.set(true);
	try {
		const fsMod = await fs();
		const items = await fsMod.readDir(dirPath);
		const result: BriefcaseEntry[] = [];

		for (const item of items) {
			// Skip hidden files/dirs
			if (item.name.startsWith('.')) continue;

			const fullPath = `${dirPath}/${item.name}`;
			const isDir = item.isDirectory ?? false;
			const ext = isDir ? null : getExtension(item.name);

			let size = 0;
			let modifiedAt: number | null = null;
			try {
				const stat = await fsMod.stat(fullPath);
				size = stat.size ?? 0;
				modifiedAt = stat.mtime ? new Date(stat.mtime).getTime() : null;
			} catch { /* stat may fail */ }

			result.push({
				name: item.name,
				path: fullPath,
				isDir,
				extension: ext,
				size,
				modifiedAt,
			});
		}

		// Sort: directories first, then by name
		result.sort((a, b) => {
			if (a.isDir && !b.isDir) return -1;
			if (!a.isDir && b.isDir) return 1;
			return a.name.localeCompare(b.name);
		});

		entries.set(result);
		currentPath.set(dirPath);
	} catch {
		entries.set([]);
	} finally {
		briefcaseLoading.set(false);
	}
}

export async function navigateTo(dirPath: string): Promise<void> {
	await loadEntries(dirPath);
}

export async function navigateUp(): Promise<void> {
	let current = '';
	currentPath.subscribe((v) => (current = v))();
	let root = '';
	briefcaseRoot.subscribe((v) => (root = v))();
	if (current === root) return;
	const parent = current.substring(0, current.lastIndexOf('/'));
	if (parent.length >= root.length) {
		await loadEntries(parent);
	}
}

export async function createFolder(name: string): Promise<void> {
	let current = '';
	currentPath.subscribe((v) => (current = v))();
	const fsMod = await fs();
	await fsMod.mkdir(`${current}/${name}`, { recursive: true });
	await loadEntries(current);
}

export async function createFile(name: string): Promise<string> {
	let current = '';
	currentPath.subscribe((v) => (current = v))();
	const fullPath = `${current}/${name}`;
	// Create empty file
	const fsMod = await fs();
	await fsMod.writeFile(fullPath, new Uint8Array(0));
	await loadEntries(current);
	return fullPath;
}

export async function renameEntry(oldPath: string, newName: string): Promise<void> {
	const fsMod = await fs();
	const dir = oldPath.substring(0, oldPath.lastIndexOf('/'));
	await fsMod.rename(oldPath, `${dir}/${newName}`);
	let current = '';
	currentPath.subscribe((v) => (current = v))();
	await loadEntries(current);
}

export async function deleteEntry(path: string): Promise<void> {
	const fsMod = await fs();
	try {
		await fsMod.remove(path, { recursive: true });
	} catch { /* may not exist */ }
	let current = '';
	currentPath.subscribe((v) => (current = v))();
	await loadEntries(current);
}

// --- Metadata (starred, recent) ---

async function loadMeta(root: string): Promise<void> {
	try {
		const fsMod = await fs();
		const bytes = await fsMod.readFile(`${root}/.briefcase/meta.json`);
		const text = new TextDecoder().decode(bytes);
		meta.set(JSON.parse(text));
	} catch {
		meta.set({ starred: [], recent: [] });
	}
}

async function saveMeta(): Promise<void> {
	let root = '';
	briefcaseRoot.subscribe((v) => (root = v))();
	let current: BriefcaseMeta = { starred: [], recent: [] };
	meta.subscribe((v) => (current = v))();
	const fsMod = await fs();
	const bytes = new TextEncoder().encode(JSON.stringify(current, null, 2));
	await fsMod.writeFile(`${root}/.briefcase/meta.json`, bytes);
}

export async function toggleStar(path: string): Promise<void> {
	meta.update((m) => {
		const idx = m.starred.indexOf(path);
		if (idx >= 0) {
			return { ...m, starred: m.starred.filter((p) => p !== path) };
		}
		return { ...m, starred: [...m.starred, path] };
	});
	await saveMeta();
}

export function isStarred(path: string, $meta: BriefcaseMeta): boolean {
	return $meta.starred.includes(path);
}

export async function addRecent(path: string): Promise<void> {
	meta.update((m) => {
		const filtered = m.recent.filter((p) => p !== path);
		return { ...m, recent: [path, ...filtered].slice(0, 20) };
	});
	await saveMeta();
}

// --- Helpers ---

function getExtension(name: string): string | null {
	const dot = name.lastIndexOf('.');
	if (dot < 0) return null;
	return name.substring(dot);
}

const TYPE_ICONS: Record<string, string> = {
	'.scribe': '\uD83D\uDCC4',
	'.stage': '\uD83C\uDFAC',
	'.ledger': '\uD83D\uDCCA',
	'.pdf': '\uD83D\uDCC4',
	'.png': '\uD83D\uDDBC\uFE0F',
	'.jpg': '\uD83D\uDDBC\uFE0F',
	'.svg': '\uD83D\uDDBC\uFE0F',
	'.md': '\uD83D\uDCCB',
	'.txt': '\uD83D\uDCC4',
	'.csv': '\uD83D\uDCC8',
	'.zip': '\uD83D\uDCE6',
};

export function entryIcon(entry: BriefcaseEntry): string {
	if (entry.isDir) return '\uD83D\uDCC1';
	return TYPE_ICONS[entry.extension ?? ''] ?? '\uD83D\uDCCE';
}

export function formatFileSize(bytes: number): string {
	if (bytes === 0) return '';
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
