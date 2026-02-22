import { writable, derived, get } from 'svelte/store';
import { studioTabs, type StudioTab } from '$lib/studios';
import { page } from '$app/state';

// --- Types ---

export interface SidebarGroup {
	id: string;
	name: string;
	collapsed: boolean;
	appIds: string[];
}

// --- Stores ---

const STORAGE_KEY = 'hecate-sidebar-groups';
const COLLAPSED_KEY = 'hecate-sidebar-collapsed';

function loadGroups(): SidebarGroup[] {
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
	if (typeof localStorage === 'undefined') return false;
	return localStorage.getItem(COLLAPSED_KEY) === 'true';
}

function persistGroups(groups: SidebarGroup[]) {
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
	}
}

function persistCollapsed(collapsed: boolean) {
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem(COLLAPSED_KEY, String(collapsed));
	}
}

export const sidebarGroups = writable<SidebarGroup[]>(loadGroups());
export const sidebarCollapsed = writable<boolean>(loadCollapsed());
export const activeAppId = writable<string | null>(null);

// Auto-persist on change
sidebarGroups.subscribe(persistGroups);
sidebarCollapsed.subscribe(persistCollapsed);

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

export function createGroup(name: string): string {
	const id = `grp-${nextGroupId++}`;
	sidebarGroups.update(($g) => [...$g, { id, name, collapsed: false, appIds: [] }]);
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
