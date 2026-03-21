// File type registry — resolves file extensions to handlers (built-in routes, plugins, or external)
//
// Resolution order:
// 1. Built-in handlers (registered at app startup)
// 2. Plugin handlers (from plugin manifests via $apps store)
// 3. Text fallback (any file opens in the editor)
// 4. No handler → null

import { derived } from 'svelte/store';
import { apps, type PluginFileType } from '$lib/stores/apps';

// --- Types ---

export interface FileTypeHandler {
	extensions: string[];
	label: string;
	icon: string;
	can_create: boolean;
	route?: string;
	plugin?: string;
	pluginDisplayName?: string;
	external?: boolean;
}

// --- Built-in Handlers ---

// Text files that open in the built-in editor
const textExtensions = [
	'.md', '.markdown', '.txt',
	'.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx',
	'.json', '.html', '.htm', '.css', '.svelte',
	'.py', '.rs', '.sql',
	'.yaml', '.yml', '.toml',
	'.xml', '.csv',
	'.sh', '.bash', '.zsh',
	'.erl', '.hrl', '.ex', '.exs',
	'.c', '.h', '.cpp', '.hpp',
	'.go', '.java', '.rb', '.lua',
	'.conf', '.cfg', '.ini', '.env',
	'.dockerfile', '.gitignore', '.editorconfig',
];

const builtinHandlers: FileTypeHandler[] = [
	{
		extensions: ['.md', '.markdown'],
		label: 'Markdown',
		icon: 'memo',
		can_create: true,
		route: '/briefcase/edit',
	},
	{
		extensions: ['.txt'],
		label: 'Text',
		icon: 'page_facing_up',
		can_create: true,
		route: '/briefcase/edit',
	},
	{
		extensions: textExtensions.filter(e => e !== '.md' && e !== '.markdown' && e !== '.txt'),
		label: 'Code',
		icon: 'page_facing_up',
		can_create: false,
		route: '/briefcase/edit',
	},
	// Future:
	// { extensions: ['.png', '.jpg', '.gif', '.svg', '.webp'], label: 'Image', icon: 'frame_with_picture', can_create: false, route: '/briefcase/view' },
	// { extensions: ['.mp4', '.webm', '.mov'], label: 'Video', icon: 'movie_camera', can_create: false, external: true },
	// { extensions: ['.pdf'], label: 'PDF', icon: 'page_facing_up', can_create: false, route: '/briefcase/view' },
];

// --- Plugin-derived Handlers ---

export const pluginHandlers = derived(apps, ($apps) => {
	const handlers: FileTypeHandler[] = [];
	for (const app of $apps.values()) {
		const fileTypes = app.manifest?.file_types;
		if (!fileTypes || !Array.isArray(fileTypes)) continue;
		for (const ft of fileTypes) {
			const exts = ft.import_extensions ?? [`.${ft.type}`];
			const isBuiltin = exts.some((ext) =>
				builtinHandlers.some((bh) => bh.extensions.includes(ext))
			);
			if (isBuiltin) continue;

			handlers.push({
				extensions: exts,
				label: ft.label,
				icon: ft.icon,
				can_create: ft.can_create,
				plugin: app.info.name,
				pluginDisplayName: app.manifest?.display_name || app.info.display_name || app.info.name,
			});
		}
	}
	return handlers;
});

// --- All Handlers (built-in + plugins) ---

export const allHandlers = derived(pluginHandlers, ($pluginHandlers) => [
	...builtinHandlers,
	...$pluginHandlers,
]);

// --- Resolution ---

/** Resolve a file extension to a handler. Falls back to editor for unknown text files. */
export function resolveFileType(
	extension: string | null,
	fileName: string,
	handlers: FileTypeHandler[]
): FileTypeHandler | null {
	if (!extension && !fileName) return null;

	for (const handler of handlers) {
		if (extension && handler.extensions.includes(extension)) return handler;
		if (handler.extensions.some((ext) => fileName.endsWith(ext))) return handler;
	}

	// Fallback: open any file with a text-like extension in the editor
	if (extension) {
		return { extensions: [extension], label: 'File', icon: 'page_facing_up', can_create: false, route: '/briefcase/edit' };
	}

	return null;
}

// --- Creatable Types (for :create command) ---

export const creatableTypes = derived(allHandlers, ($all) =>
	$all.filter((h) => h.can_create)
);
