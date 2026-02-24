import { writable, derived, get } from 'svelte/store';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { studioTabs, type StudioTab } from '$lib/studios';
import { fetchSidebarConfig, saveSidebarConfig, type SidebarGroupConfig } from '$lib/api/sidebar-config';

// --- Types ---

export interface SidebarGroup {
	id: string;
	name: string;
	icon: string;
	collapsed: boolean;
	appIds: string[];
}

// --- Stores ---

const STORAGE_KEY = 'hecate-sidebar-groups';
const COLLAPSED_KEY = 'hecate-sidebar-collapsed';

function loadGroupsFromCache(): SidebarGroup[] {
	if (typeof localStorage === 'undefined') return [];
	const raw = localStorage.getItem(STORAGE_KEY);
	if (!raw) return [];
	try {
		return JSON.parse(raw);
	} catch {
		return [];
	}
}

function loadCollapsed(): boolean {
	if (typeof localStorage === 'undefined') return true;
	const stored = localStorage.getItem(COLLAPSED_KEY);
	if (stored === null) return true;
	return stored === 'true';
}

function persistGroupsToCache(groups: SidebarGroup[]) {
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
	}
}

function persistCollapsed(collapsed: boolean) {
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem(COLLAPSED_KEY, String(collapsed));
	}
}

export const sidebarGroups = writable<SidebarGroup[]>(loadGroupsFromCache());
export const sidebarCollapsed = writable<boolean>(loadCollapsed());
export const activeAppId = writable<string | null>(null);

// Auto-persist to localStorage cache on change
sidebarGroups.subscribe(persistGroupsToCache);
sidebarCollapsed.subscribe(persistCollapsed);

// --- Daemon sync ---

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let initialized = false;
let lastLocalSave = 0;
const SUPPRESS_WINDOW = 2000;

function groupsToConfig(groups: SidebarGroup[]): SidebarGroupConfig[] {
	return groups.map((g) => ({
		name: g.name,
		icon: g.icon,
		collapsed: g.collapsed,
		apps: g.appIds
	}));
}

function configToGroups(configs: SidebarGroupConfig[]): SidebarGroup[] {
	return configs.map((c, i) => ({
		id: `grp-${Date.now()}-${i}`,
		name: c.name,
		icon: c.icon || '\uD83D\uDCC1',
		collapsed: c.collapsed,
		appIds: c.apps
	}));
}

function debounceSaveToDaemon() {
	if (!initialized) return;
	if (saveTimeout) clearTimeout(saveTimeout);
	saveTimeout = setTimeout(() => {
		lastLocalSave = Date.now();
		const groups = get(sidebarGroups);
		saveSidebarConfig(groupsToConfig(groups)).catch(() => {
			// Daemon may be offline — cache is already updated
		});
	}, 500);
}

/** Called when daemon connects. Fetches canonical config from daemon. */
export async function initSidebar(): Promise<void> {
	try {
		const configs = await fetchSidebarConfig();
		if (configs.length > 0) {
			sidebarGroups.set(configToGroups(configs));
		}
	} catch {
		// Daemon offline — keep cached groups
	}
	initialized = true;
}

// --- Config file watcher ---

let configUnlisten: UnlistenFn | null = null;

export async function startConfigWatcher(): Promise<void> {
	if (configUnlisten) return;
	configUnlisten = await listen('sidebar-config-changed', async () => {
		if (Date.now() - lastLocalSave < SUPPRESS_WINDOW) return;
		try {
			const configs = await fetchSidebarConfig();
			if (configs.length > 0) {
				sidebarGroups.set(configToGroups(configs));
			}
		} catch {
			// Daemon offline — keep cached groups
		}
	});
}

export function stopConfigWatcher(): void {
	if (configUnlisten) {
		configUnlisten();
		configUnlisten = null;
	}
}

// Subscribe to changes and debounce-save to daemon
sidebarGroups.subscribe(() => {
	debounceSaveToDaemon();
});

// --- Derived ---

/** App IDs that are assigned to at least one group */
const groupedAppIds = derived(sidebarGroups, ($groups) => {
	const ids = new Set<string>();
	for (const g of $groups) {
		for (const id of g.appIds) ids.add(id);
	}
	return ids;
});

/** Tabs that are not in any group */
export const ungroupedApps = derived(
	[studioTabs, groupedAppIds],
	([$tabs, $grouped]) => $tabs.filter((t) => !$grouped.has(t.id))
);

// --- Group CRUD ---

let nextGroupId = Date.now();

export function createGroup(name: string, icon: string = '\uD83D\uDCC1'): string {
	const id = `grp-${nextGroupId++}`;
	sidebarGroups.update(($g) => [...$g, { id, name, icon, collapsed: false, appIds: [] }]);
	return id;
}

export function renameGroup(groupId: string, name: string) {
	sidebarGroups.update(($g) =>
		$g.map((g) => (g.id === groupId ? { ...g, name } : g))
	);
}

export function deleteGroup(groupId: string) {
	sidebarGroups.update(($g) => $g.filter((g) => g.id !== groupId));
}

export function toggleGroupCollapsed(groupId: string) {
	sidebarGroups.update(($g) =>
		$g.map((g) => (g.id === groupId ? { ...g, collapsed: !g.collapsed } : g))
	);
}

export function updateGroupIcon(groupId: string, icon: string) {
	sidebarGroups.update(($g) =>
		$g.map((g) => (g.id === groupId ? { ...g, icon } : g))
	);
}

// --- App movement ---

/** Move an app into a group. Removes it from any other group first. */
export function moveApp(appId: string, targetGroupId: string) {
	sidebarGroups.update(($g) =>
		$g.map((g) => {
			const filtered = g.appIds.filter((id) => id !== appId);
			if (g.id === targetGroupId) {
				return { ...g, appIds: [...filtered, appId] };
			}
			return { ...g, appIds: filtered };
		})
	);
}

/** Remove an app from all groups (back to Ungrouped). */
export function ungroupApp(appId: string) {
	sidebarGroups.update(($g) =>
		$g.map((g) => ({ ...g, appIds: g.appIds.filter((id) => id !== appId) }))
	);
}

/** Reorder an app within a group (drag within same group). */
export function reorderApp(groupId: string, appId: string, newIndex: number) {
	sidebarGroups.update(($g) =>
		$g.map((g) => {
			if (g.id !== groupId) return g;
			const filtered = g.appIds.filter((id) => id !== appId);
			filtered.splice(newIndex, 0, appId);
			return { ...g, appIds: filtered };
		})
	);
}

// --- Sidebar panel toggle ---

export function toggleSidebar() {
	sidebarCollapsed.update((c) => !c);
}

// --- Sync activeAppId from current route ---

export function syncActiveAppFromRoute(pathname: string, tabs: StudioTab[]) {
	if (pathname === '/') {
		activeAppId.set(null);
		return;
	}
	const match = tabs.find((t) =>
		t.path === '/' ? pathname === '/' : pathname.startsWith(t.path)
	);
	activeAppId.set(match?.id ?? null);
}
